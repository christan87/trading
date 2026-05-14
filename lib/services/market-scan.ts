import Anthropic from "@anthropic-ai/sdk";
import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
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
    // High congressional activity = elevated uncertainty
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

export interface ScanRunSummary {
  runId: string;
  candidatesFound: number;
  sectorsImpacted: string[];
  scannedAt: Date;
}

export class MarketScanService {
  async runScan(): Promise<ScanRunSummary> {
    const runId = new ObjectId().toHexString();
    const scannedAt = new Date();

    // Step 1: Fetch recent political/regulatory/geopolitical news (no user token needed — general market news)
    const politicalArticles = await this.fetchPoliticalNews();

    if (politicalArticles.length === 0) {
      return { runId, candidatesFound: 0, sectorsImpacted: [], scannedAt };
    }

    // Step 2: Claude Sonnet classifies which sectors are impacted
    const sectorImpacts = await this.classifySectors(politicalArticles);
    if (sectorImpacts.length === 0) {
      return { runId, candidatesFound: 0, sectorsImpacted: [], scannedAt };
    }

    const impactedSectorNames = [...new Set(sectorImpacts.map((s) => s.sector))];

    // Step 3: Find S&P 500 candidates in impacted sectors
    const candidates = sp500.filter((stock) =>
      impactedSectorNames.includes(stock.sector)
    );

    // Limit to top 20 candidates to stay within rate limits
    const topCandidates = candidates.slice(0, 20);

    // Step 4: For each candidate, gather congress cluster + recent news + run Claude Opus analysis
    const results: Omit<ScanResult, "_id">[] = [];

    for (const candidate of topCandidates) {
      try {
        const result = await this.analyzeCandidate(
          candidate,
          sectorImpacts,
          politicalArticles,
          runId,
          scannedAt
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
      runId,
      candidatesFound: results.length,
      sectorsImpacted: impactedSectorNames,
      scannedAt,
    };
  }

  private async fetchPoliticalNews(): Promise<NewsEvent[]> {
    const { news } = await getCollections();
    const since = new Date(Date.now() - 3 * 86400_000); // last 3 days
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
    runId: string,
    scannedAt: Date
  ): Promise<Omit<ScanResult, "_id"> | null> {
    const sectorMatch = sectorImpacts.find((s) => s.sector === candidate.sector);
    if (!sectorMatch) return null;

    // Build triggers from sector impact
    const triggers: ScanResult["triggers"] = [
      {
        type: sectorMatch.triggerType,
        description: sectorMatch.rationale,
        date: scannedAt,
        source: "news_analysis",
        relevanceScore: sectorMatch.confidence / 100,
      },
    ];

    // Get congress cluster for this symbol
    const congressCluster = await this.getCongressCluster(candidate.symbol);

    // Add congress trigger if bullish/bearish cluster exists
    if (congressCluster && congressCluster.direction !== "neutral") {
      triggers.push({
        type: "congress_trade",
        description: `${congressCluster.purchases} purchases vs ${congressCluster.sales} sales by ${congressCluster.members.length} members in last ${congressCluster.windowDays} days`,
        date: scannedAt,
        source: "congressional_data",
        relevanceScore: Math.min(1, (congressCluster.purchases + congressCluster.sales) / 10),
      });
    }

    // Get symbol-specific news headlines from the article pool
    const symbolNews = allArticles
      .filter((a) => a.tickers.includes(candidate.symbol))
      .map(categorizeArticle);

    // Add general sector news (not symbol-specific)
    const relevantArticleIndices = sectorMatch.articleIndices ?? [];
    const sectorArticles = relevantArticleIndices
      .map((i) => allArticles[i])
      .filter(Boolean)
      .map(categorizeArticle);

    const newsHeadlines = [...symbolNews, ...sectorArticles].slice(0, 10);
    const riskScore = computeTier1Risk({ congressCluster, newsHeadlines });

    // Only analyze with Claude if triggers are meaningful
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

    // Skip low-confidence results
    if (!aiAnalysis || aiAnalysis.confidence < 30) return null;

    const triggerTypes = [...new Set(triggers.map((t) => t.type))];
    const primaryTrigger = triggerTypes[0] ?? "political_event";

    return {
      runId,
      symbol: candidate.symbol,
      companyName: candidate.name,
      sector: candidate.sector,
      triggerType: primaryTrigger,
      triggers,
      congressCluster,
      newsHeadlines,
      aiAnalysis,
      riskScore,
      status: "new",
      scannedAt,
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
      .find({ status: { $ne: "dismissed" } })
      .sort({ scannedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getResultsByRunId(runId: string): Promise<ScanResult[]> {
    const { scanResults } = await getCollections();
    return scanResults.find({ runId }).sort({ riskScore: 1, "aiAnalysis.confidence": -1 }).toArray();
  }

  async updateStatus(id: string, status: ScanResult["status"]): Promise<void> {
    const { scanResults } = await getCollections();
    await scanResults.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
  }

  async getRecentRunIds(limit = 5): Promise<{ runId: string; scannedAt: Date; count: number }[]> {
    const { scanResults } = await getCollections();
    const pipeline = [
      { $sort: { scannedAt: -1 } },
      { $group: { _id: "$runId", scannedAt: { $first: "$scannedAt" }, count: { $sum: 1 } } },
      { $sort: { scannedAt: -1 } },
      { $limit: limit },
      { $project: { runId: "$_id", scannedAt: 1, count: 1, _id: 0 } },
    ];
    return scanResults.aggregate<{ runId: string; scannedAt: Date; count: number }>(pipeline).toArray();
  }
}

export const marketScanService = new MarketScanService();
