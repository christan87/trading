import Anthropic from "@anthropic-ai/sdk";
import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import { getRedis } from "@/lib/utils/redis";
import { newsService } from "@/lib/services/news";
import { congressService } from "@/lib/services/congress";
import type { ScanResult, NewsEvent } from "@/lib/db/models";
import {
  buildSectorScanPrompt,
  SECTOR_SCAN_SYSTEM_PROMPT,
} from "@/lib/prompts/scan-sectors";
import {
  buildCandidateAnalysisPrompt,
  CANDIDATE_ANALYSIS_SYSTEM_PROMPT,
} from "@/lib/prompts/scan-candidates";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sp500: { symbol: string; name: string; sector: string }[] = require("@/data/sp500.json");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCAN_DAILY_LIMIT = 6;
const SCAN_EXPIRY_DAYS = 7;

interface SectorImpact {
  sector: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  rationale: string;
  triggerType: ScanResult["triggers"][number]["type"];
  articleIndices: number[];
}

function computeTier1Risk(params: {
  congressCluster: ScanResult["congressCluster"];
  newsHeadlines: ScanResult["newsHeadlines"];
}): number {
  let score = 3; // baseline

  if (params.congressCluster) {
    const { purchases, sales } = params.congressCluster;
    if (purchases + sales >= 5) score += 2;
    else if (purchases + sales >= 3) score += 1;
  }

  const negativeNews = params.newsHeadlines.filter((n) => n.sentiment === "negative").length;
  if (negativeNews >= 3) score += 2;
  else if (negativeNews >= 1) score += 1;

  const regulatoryNews = params.newsHeadlines.filter((n) => n.category === "regulatory").length;
  if (regulatoryNews >= 2) score += 1;

  return Math.min(10, score);
}

function categorizeArticle(article: NewsEvent): ScanResult["newsHeadlines"][number] {
  return {
    headline: article.headline,
    sentiment: article.sentiment ?? "neutral",
    publishedAt: article.publishedAt,
    category: article.category,
  };
}

function todayKey(): string {
  return `scan:daily_count:${new Date().toISOString().split("T")[0]}`;
}

export interface ScanRunSummary {
  scanId: string;
  candidatesFound: number;
  sectorsImpacted: string[];
  scannedAt: Date;
  rateLimited?: boolean;
  scansRemainingToday?: number;
}

export class MarketScanService {
  async checkDailyLimit(): Promise<{ allowed: boolean; remaining: number }> {
    const redis = getRedis();
    const key = todayKey();
    const count = await redis.get<number>(key) ?? 0;
    return { allowed: count < SCAN_DAILY_LIMIT, remaining: SCAN_DAILY_LIMIT - count };
  }

  private async incrementDailyCount(): Promise<void> {
    const redis = getRedis();
    const key = todayKey();
    const current = await redis.get<number>(key) ?? 0;
    // Expires at end of day (86400s)
    await redis.set(key, current + 1, { ex: 86400 });
  }

  async runScan(triggerType: ScanResult["triggerType"] = "manual"): Promise<ScanRunSummary> {
    const { allowed, remaining } = await this.checkDailyLimit();
    if (!allowed) {
      return {
        scanId: "",
        candidatesFound: 0,
        sectorsImpacted: [],
        scannedAt: new Date(),
        rateLimited: true,
        scansRemainingToday: 0,
      };
    }

    await this.incrementDailyCount();

    const scanId = new ObjectId().toHexString();
    const scannedAt = new Date();
    const expiresAt = new Date(Date.now() + SCAN_EXPIRY_DAYS * 86400_000);

    // Step 1: Fetch recent political/regulatory/geopolitical news
    const politicalArticles = await this.fetchPoliticalNews();

    if (politicalArticles.length === 0) {
      return { scanId, candidatesFound: 0, sectorsImpacted: [], scannedAt, scansRemainingToday: remaining - 1 };
    }

    // Build a human-readable trigger summary from the most recent article
    const topArticle = politicalArticles[0];
    const triggerSummary = topArticle
      ? `${topArticle.category.charAt(0).toUpperCase() + topArticle.category.slice(1)} event: ${topArticle.headline.slice(0, 120)}`
      : "Scan triggered by recent political/regulatory news";

    // Step 2: Claude Sonnet classifies which sectors are impacted
    const sectorImpacts = await this.classifySectors(politicalArticles);
    if (sectorImpacts.length === 0) {
      return { scanId, candidatesFound: 0, sectorsImpacted: [], scannedAt, scansRemainingToday: remaining - 1 };
    }

    const impactedSectorNames = [...new Set(sectorImpacts.map((s) => s.sector))];

    // Step 3: Find S&P 500 candidates in impacted sectors (max 20)
    const candidates = sp500
      .filter((stock) => impactedSectorNames.includes(stock.sector))
      .slice(0, 20);

    // Step 4: For each candidate, gather congress cluster + recent news + Claude Opus analysis
    const results: Omit<ScanResult, "_id">[] = [];

    for (const candidate of candidates) {
      try {
        const result = await this.analyzeCandidate(
          candidate,
          sectorImpacts,
          politicalArticles,
          scanId,
          triggerType,
          triggerSummary,
          scannedAt,
          expiresAt
        );
        if (result) results.push(result);
      } catch {
        // Skip failed candidates — don't abort the whole scan
      }
    }

    // Step 5: Persist results
    if (results.length > 0) {
      const { scanResults } = await getCollections();
      await scanResults.insertMany(results as ScanResult[]);
    }

    return {
      scanId,
      candidatesFound: results.length,
      sectorsImpacted: impactedSectorNames,
      scannedAt,
      scansRemainingToday: remaining - 1,
    };
  }

  private async fetchPoliticalNews(): Promise<NewsEvent[]> {
    const { news } = await getCollections();
    const since = new Date(Date.now() - 3 * 86400_000);
    return news
      .find({
        category: { $in: ["political", "regulatory", "geopolitical"] },
        publishedAt: { $gte: since },
      })
      .sort({ publishedAt: -1 })
      .limit(50)
      .toArray();
  }

  private async classifySectors(articles: NewsEvent[]): Promise<SectorImpact[]> {
    const articleInputs = articles.map((a) => ({
      headline: a.headline,
      summary: a.summary,
      category: a.category,
      publishedAt: a.publishedAt.toISOString(),
    }));

    const prompt = buildSectorScanPrompt(articleInputs);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SECTOR_SCAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const parsed = JSON.parse(text) as { impactedSectors: SectorImpact[] };
      return parsed.impactedSectors ?? [];
    } catch {
      return [];
    }
  }

  private async analyzeCandidate(
    candidate: { symbol: string; name: string; sector: string },
    sectorImpacts: SectorImpact[],
    allArticles: NewsEvent[],
    scanId: string,
    triggerType: ScanResult["triggerType"],
    triggerSummary: string,
    scannedAt: Date,
    expiresAt: Date
  ): Promise<Omit<ScanResult, "_id"> | null> {
    const sectorMatch = sectorImpacts.find((s) => s.sector === candidate.sector);
    if (!sectorMatch) return null;

    const triggers: ScanResult["triggers"] = [
      {
        type: sectorMatch.triggerType,
        description: sectorMatch.rationale,
        date: scannedAt,
        source: "news_analysis",
        relevanceScore: sectorMatch.confidence / 100,
      },
    ];

    const congressCluster = await this.getCongressCluster(candidate.symbol);

    if (congressCluster && congressCluster.direction !== "neutral") {
      triggers.push({
        type: "congress_trade",
        description: `${congressCluster.purchases} purchases vs ${congressCluster.sales} sales by ${congressCluster.members.length} members in last ${congressCluster.windowDays} days`,
        date: scannedAt,
        source: "congressional_data",
        relevanceScore: Math.min(1, (congressCluster.purchases + congressCluster.sales) / 10),
      });
    }

    const symbolNews = allArticles
      .filter((a) => a.tickers.includes(candidate.symbol))
      .map(categorizeArticle);

    const sectorArticles = (sectorMatch.articleIndices ?? [])
      .map((i) => allArticles[i])
      .filter(Boolean)
      .map(categorizeArticle);

    const newsHeadlines = [...symbolNews, ...sectorArticles].slice(0, 10);
    const riskScore = computeTier1Risk({ congressCluster, newsHeadlines });

    const maxRelevance = Math.max(...triggers.map((t) => t.relevanceScore));
    if (maxRelevance < 0.4) return null;

    const aiAnalysis = await this.runCandidateAnalysis({
      symbol: candidate.symbol,
      companyName: candidate.name,
      sector: candidate.sector,
      triggers,
      congressCluster,
      newsHeadlines,
      riskScore,
    });

    if (!aiAnalysis || aiAnalysis.confidence < 30) return null;

    const primaryTriggerType = [...new Set(triggers.map((t) => t.type))][0] ?? "political_event";

    // Derive impact level and timeframe from confidence and trigger type
    const expectedImpact: ScanResult["expectedImpact"] =
      aiAnalysis.confidence >= 70 ? "high" : aiAnalysis.confidence >= 50 ? "moderate" : "low";

    const impactTimeframe: ScanResult["impactTimeframe"] =
      aiAnalysis.suggestedTimeframe === "intraday"
        ? "days"
        : aiAnalysis.suggestedTimeframe === "swing"
        ? "weeks"
        : "months";

    const direction: ScanResult["direction"] =
      aiAnalysis.suggestedDirection === "long"
        ? "bullish"
        : aiAnalysis.suggestedDirection === "short"
        ? "bearish"
        : "neutral";

    return {
      userId: null,
      scanId,
      triggerType,
      triggerSummary,
      symbol: candidate.symbol,
      companyName: candidate.name,
      sector: candidate.sector,
      industry: candidate.sector, // default to sector; can be enriched via Finnhub profile later
      triggers,
      entryRange: null, // populated when user promotes to full recommendation
      expectedImpact,
      impactTimeframe,
      direction,
      congressCluster,
      newsHeadlines,
      aiAnalysis,
      riskScore,
      status: "new",
      promotedToRecommendationId: null,
      scannedAt,
      expiresAt,
    };
  }

  private async getCongressCluster(symbol: string): Promise<ScanResult["congressCluster"]> {
    try {
      const trades = await congressService.getTradesForSymbol(symbol, 30);
      if (trades.length === 0) return null;

      const purchases = trades.filter((t) => t.transactionType === "purchase").length;
      const sales = trades.filter((t) => t.transactionType === "sale").length;
      const members = [...new Set(trades.map((t) => t.memberName))];

      let direction: "bullish" | "bearish" | "neutral" = "neutral";
      if (purchases >= 2 && purchases > sales) direction = "bullish";
      else if (sales >= 2 && sales > purchases) direction = "bearish";

      return { purchases, sales, members, direction, windowDays: 30 };
    } catch {
      return null;
    }
  }

  private async runCandidateAnalysis(params: {
    symbol: string;
    companyName: string;
    sector: string;
    triggers: ScanResult["triggers"];
    congressCluster: ScanResult["congressCluster"];
    newsHeadlines: ScanResult["newsHeadlines"];
    riskScore: number;
  }): Promise<ScanResult["aiAnalysis"]> {
    const prompt = buildCandidateAnalysisPrompt(params);

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      system: CANDIDATE_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      return JSON.parse(text) as ScanResult["aiAnalysis"];
    } catch {
      return null;
    }
  }

  async getLatestResults(limit = 20): Promise<ScanResult[]> {
    const { scanResults } = await getCollections();
    return scanResults
      .find({ status: { $ne: "dismissed" }, expiresAt: { $gt: new Date() } })
      .sort({ scannedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getResultsByScanId(scanId: string): Promise<ScanResult[]> {
    const { scanResults } = await getCollections();
    return scanResults
      .find({ scanId })
      .sort({ riskScore: 1, "aiAnalysis.confidence": -1 })
      .toArray();
  }

  async updateStatus(id: string, status: ScanResult["status"]): Promise<void> {
    const { scanResults } = await getCollections();
    await scanResults.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
  }

  async promoteToRecommendation(id: string, recommendationId: string): Promise<void> {
    const { scanResults } = await getCollections();
    await scanResults.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "promoted", promotedToRecommendationId: new ObjectId(recommendationId) } }
    );
  }

  async getRecentRunIds(limit = 5): Promise<{ scanId: string; scannedAt: Date; count: number }[]> {
    const { scanResults } = await getCollections();
    const pipeline = [
      { $sort: { scannedAt: -1 } },
      { $group: { _id: "$scanId", scannedAt: { $first: "$scannedAt" }, count: { $sum: 1 } } },
      { $sort: { scannedAt: -1 } },
      { $limit: limit },
      { $project: { scanId: "$_id", scannedAt: 1, count: 1, _id: 0 } },
    ];
    return scanResults.aggregate<{ scanId: string; scannedAt: Date; count: number }>(pipeline).toArray();
  }

  async deleteExpired(): Promise<number> {
    const { scanResults } = await getCollections();
    const result = await scanResults.deleteMany({ expiresAt: { $lt: new Date() } });
    return result.deletedCount;
  }
}

export const marketScanService = new MarketScanService();
