import Anthropic from "@anthropic-ai/sdk";
import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";
import { newsService, inferCategory, inferSentiment } from "@/lib/services/news";
import { congressService } from "@/lib/services/congress";
import { rejectedScanTracker } from "@/lib/services/rejected-scan-tracker";
import { marketDataService } from "@/lib/services/market-data";
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

const SCAN_DAILY_LIMIT = parseInt(process.env.SCAN_DAILY_LIMIT ?? "12", 10);
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

export interface ScanProgress {
  scanId: string;
  step: number;
  stepLabel: string;
  percentComplete: number;
  candidatesFound: number;
  candidatesAnalyzed: number;
  candidatesTotal: number;
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

  private async publishEvent(scanId: string, event: object): Promise<void> {
    try {
      const redis = getRedis();
      const key = REDIS_KEYS.scanEvents(scanId);
      await redis.rpush(key, JSON.stringify(event));
      await redis.expire(key, 300); // 5-minute TTL covers any scan
    } catch {
      // Non-fatal: progress streaming failure doesn't break the scan
    }
  }

  private async publishProgress(scanId: string, progress: Omit<ScanProgress, "scanId">): Promise<void> {
    await this.publishEvent(scanId, { type: "progress", ...progress, scanId });
  }

  async runScan(
    triggerType: ScanResult["triggerType"] = "manual",
    providedScanId?: string
  ): Promise<ScanRunSummary> {
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

    const scanId = providedScanId ?? new ObjectId().toHexString();
    const scannedAt = new Date();
    const expiresAt = new Date(Date.now() + SCAN_EXPIRY_DAYS * 86400_000);

    // Step 1: Trigger received
    await this.publishProgress(scanId, {
      step: 1,
      stepLabel: "Fetching recent news…",
      percentComplete: 2,
      candidatesFound: 0,
      candidatesAnalyzed: 0,
      candidatesTotal: 0,
    });

    const politicalArticles = await this.fetchPoliticalNews();
    console.log(`[scan ${scanId}] step1: ${politicalArticles.length} political/macro articles`);

    if (politicalArticles.length === 0) {
      console.log(`[scan ${scanId}] aborting — no news articles found`);
      await this.publishEvent(scanId, { type: "done", scanId, candidatesFound: 0 });
      return { scanId, candidatesFound: 0, sectorsImpacted: [], scannedAt, scansRemainingToday: remaining - 1 };
    }

    const topArticle = politicalArticles[0];
    const triggerSummary = topArticle
      ? `${topArticle.category.charAt(0).toUpperCase() + topArticle.category.slice(1)} event: ${topArticle.headline.slice(0, 120)}`
      : "Scan triggered by recent political/regulatory news";

    // Step 2: Sector classification
    await this.publishProgress(scanId, {
      step: 2,
      stepLabel: "Classifying impacted sectors…",
      percentComplete: 10,
      candidatesFound: 0,
      candidatesAnalyzed: 0,
      candidatesTotal: 0,
    });

    const sectorImpacts = await this.classifySectors(politicalArticles);
    console.log(`[scan ${scanId}] step2: ${sectorImpacts.length} sector impacts — ${sectorImpacts.map(s => s.sector).join(", ")}`);

    if (sectorImpacts.length === 0) {
      console.log(`[scan ${scanId}] aborting — Claude returned no impacted sectors`);
      await this.publishEvent(scanId, { type: "done", scanId, candidatesFound: 0 });
      return { scanId, candidatesFound: 0, sectorsImpacted: [], scannedAt, scansRemainingToday: remaining - 1 };
    }

    const impactedSectorNames = [...new Set(sectorImpacts.map((s) => s.sector))];

    // Step 3: Candidate filtering
    const candidates = sp500
      .filter((stock) => impactedSectorNames.includes(stock.sector))
      .slice(0, 20);
    console.log(`[scan ${scanId}] step3: ${candidates.length} S&P 500 candidates in sectors: ${impactedSectorNames.join(", ")}`);

    await this.publishProgress(scanId, {
      step: 3,
      stepLabel: `Filtering candidates in ${impactedSectorNames.slice(0, 3).join(", ")}…`,
      percentComplete: 30,
      candidatesFound: 0,
      candidatesAnalyzed: 0,
      candidatesTotal: candidates.length,
    });

    // Step 4: Per-candidate analysis — save each result immediately and stream it
    const { scanResults: scanResultsCol } = await getCollections();
    let candidatesFound = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const stepProgress = 50 + Math.round((i / candidates.length) * 45);

      await this.publishProgress(scanId, {
        step: 4,
        stepLabel: `Analyzing ${candidate.symbol}…`,
        percentComplete: stepProgress,
        candidatesFound,
        candidatesAnalyzed: i,
        candidatesTotal: candidates.length,
      });

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
        if (result) {
          const inserted = await scanResultsCol.insertOne(result as ScanResult);
          candidatesFound++;
          console.log(`[scan ${scanId}] ✓ ${candidate.symbol} confidence=${result.aiAnalysis?.confidence}`);
          await this.publishEvent(scanId, {
            type: "result",
            scanId,
            data: { ...result, _id: inserted.insertedId.toHexString() },
          });
        } else {
          console.log(`[scan ${scanId}] ✗ ${candidate.symbol} filtered out`);
        }
      } catch (err) {
        console.log(`[scan ${scanId}] ✗ ${candidate.symbol} error: ${String(err).slice(0, 120)}`);
      }
    }

    // Free-fall detection — results saved and streamed as they come
    let freeFallCount = 0;
    try {
      const freeFallResults = await this.detectFreeFalls(scanId, scannedAt, expiresAt);
      console.log(`[scan ${scanId}] free-fall: ${freeFallResults.length} bearish signals`);
      for (const result of freeFallResults) {
        const inserted = await scanResultsCol.insertOne(result as ScanResult);
        freeFallCount++;
        await this.publishEvent(scanId, {
          type: "result",
          scanId,
          data: { ...result, _id: inserted.insertedId.toHexString() },
        });
      }
    } catch (err) {
      console.error(`[scan ${scanId}] free-fall detection error:`, err);
    }

    const totalFound = candidatesFound + freeFallCount;

    await this.publishProgress(scanId, {
      step: 5,
      stepLabel: `Scan complete — ${totalFound} result${totalFound !== 1 ? "s" : ""} found`,
      percentComplete: 100,
      candidatesFound: totalFound,
      candidatesAnalyzed: candidates.length,
      candidatesTotal: candidates.length,
    });
    await this.publishEvent(scanId, { type: "done", scanId, candidatesFound: totalFound });

    return {
      scanId,
      candidatesFound: totalFound,
      sectorsImpacted: impactedSectorNames,
      scannedAt,
      scansRemainingToday: remaining - 1,
    };
  }

  private async fetchPoliticalNews(): Promise<NewsEvent[]> {
    const { news } = await getCollections();
    const since = new Date(Date.now() - 3 * 86400_000);
    const stored = await news
      .find({
        category: { $in: ["political", "regulatory", "geopolitical", "macro"] },
        publishedAt: { $gte: since },
      })
      .sort({ publishedAt: -1 })
      .limit(50)
      .toArray();

    if (stored.length > 0) return stored;

    // Fallback: fetch directly from Finnhub when the news DB is empty
    try {
      const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";
      const res = await fetch(
        `https://finnhub.io/api/v1/news?category=general&minId=0&token=${FINNHUB_KEY}`
      );
      if (!res.ok) return [];
      // external API response — shape is unknown at compile time
      const items = await res.json() as { id: number; headline: string; summary: string; related: string; datetime: number }[];
      return items.slice(0, 50).map((item) => ({
        _id: undefined as never,
        sourceApi: "finnhub" as const,
        externalId: String(item.id),
        headline: item.headline ?? "",
        summary: item.summary || item.headline || "",
        tickers: item.related ? String(item.related).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        category: inferCategory(item.headline ?? ""),
        sentiment: inferSentiment((item.headline ?? "") + " " + (item.summary ?? "")),
        historicalAnalogs: null,
        publishedAt: new Date(item.datetime * 1000),
        ingestedAt: new Date(),
      })).filter((a) => ["political", "regulatory", "geopolitical", "macro"].includes(a.category));
    } catch {
      return [];
    }
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
      max_tokens: 2048,
      system: SECTOR_SCAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? text) as { impactedSectors: SectorImpact[] };
      return parsed.impactedSectors ?? [];
    } catch (err) {
      console.error("[scan classifySectors] JSON parse failed:", err, "\nRaw response:", text.slice(0, 500));
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

    const [congressCluster, insiderPurchases] = await Promise.all([
      this.getCongressCluster(candidate.symbol),
      congressService.getInsiderPurchases(candidate.symbol, 60),
    ]);

    if (congressCluster && congressCluster.direction !== "neutral") {
      triggers.push({
        type: "congress_trade",
        description: `${congressCluster.purchases} purchases vs ${congressCluster.sales} sales by ${congressCluster.members.length} members in last ${congressCluster.windowDays} days`,
        date: scannedAt,
        source: "congressional_data",
        relevanceScore: Math.min(1, (congressCluster.purchases + congressCluster.sales) / 10),
      });
    }

    if (insiderPurchases.length >= 2) {
      const totalValue = insiderPurchases.reduce((sum, t) => sum + t.value, 0);
      triggers.push({
        type: "political_event",
        description: `${insiderPurchases.length} insider purchases totaling $${(totalValue / 1_000_000).toFixed(1)}M in last 60 days`,
        date: scannedAt,
        source: "insider_transactions",
        relevanceScore: Math.min(1, insiderPurchases.length / 5),
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
    if (maxRelevance < 0.4) {
      const reason = `Low relevance score (${maxRelevance.toFixed(2)} < 0.4)`;
      rejectedScanTracker.recordAutoFilter({
        scanId,
        userId: null,
        symbol: candidate.symbol,
        sector: candidate.sector,
        triggerSummary,
        rejectionSource: "auto_filter",
        rejectionReason: reason,
      }).catch(() => undefined);
      this.publishEvent(scanId, {
        type: "rejection",
        symbol: candidate.symbol,
        sector: candidate.sector,
        reason,
      }).catch(() => undefined);
      return null;
    }

    const aiAnalysis = await this.runCandidateAnalysis({
      symbol: candidate.symbol,
      companyName: candidate.name,
      sector: candidate.sector,
      triggers,
      congressCluster,
      newsHeadlines,
      riskScore,
      insiderPurchases: insiderPurchases.map((t) => ({
        name: t.name,
        shares: t.shares,
        value: t.value,
        transactionDate: t.transactionDate,
      })),
    });

    if (!aiAnalysis || aiAnalysis.confidence < 30) {
      const reason = `Low AI confidence (${aiAnalysis?.confidence ?? 0} < 30)`;
      rejectedScanTracker.recordAutoFilter({
        scanId,
        userId: null,
        symbol: candidate.symbol,
        sector: candidate.sector,
        triggerSummary,
        rejectionSource: "low_confidence",
        rejectionReason: reason,
      }).catch(() => undefined);
      this.publishEvent(scanId, {
        type: "rejection",
        symbol: candidate.symbol,
        sector: candidate.sector,
        reason,
      }).catch(() => undefined);
      return null;
    }

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
    insiderPurchases?: { name: string; shares: number; value: number; transactionDate: Date }[];
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
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch?.[0] ?? text) as ScanResult["aiAnalysis"];
    } catch {
      console.error(`[scan runCandidateAnalysis] parse failed for ${params.symbol}:`, text.slice(0, 300));
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

  private async detectFreeFalls(
    scanId: string,
    scannedAt: Date,
    expiresAt: Date
  ): Promise<Omit<ScanResult, "_id">[]> {
    const results: Omit<ScanResult, "_id">[] = [];

    // Sample a cross-sector subset of S&P 500 (up to 50) to check for free-falls
    const candidates = sp500.slice(0, 50);

    for (const candidate of candidates) {
      try {
        const bars = await marketDataService.getBars(candidate.symbol, "1Day", 25);
        if (bars.length < 6) continue;

        const closes = bars.map((b) => b.close);
        const last5Closes = closes.slice(-5);
        const priceChange5d = ((last5Closes[4] - last5Closes[0]) / last5Closes[0]) * 100;

        // Must be down > 10% over last 5 trading days
        if (priceChange5d > -10) continue;

        const avgVolume20 = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
        const todayVolume = bars[bars.length - 1].volume;
        const volumeSpike = avgVolume20 > 0 ? todayVolume / avgVolume20 : 0;

        // Volume must confirm panic (>2x average)
        if (volumeSpike < 2) continue;

        // RSI below 30
        const gains = closes.slice(1).map((c, i) => Math.max(0, c - closes[i]));
        const losses = closes.slice(1).map((c, i) => Math.max(0, closes[i] - c));
        const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        if (rsi >= 30) continue;

        const currentPrice = closes[closes.length - 1];
        const triggerSummary = `Free-fall detected: ${candidate.symbol} down ${Math.abs(priceChange5d).toFixed(1)}% in 5 days, RSI ${rsi.toFixed(0)}, volume ${volumeSpike.toFixed(1)}x avg`;

        results.push({
          userId: null,
          scanId,
          triggerType: "free_fall",
          triggerSummary,
          symbol: candidate.symbol,
          companyName: candidate.name,
          sector: candidate.sector,
          industry: candidate.sector,
          triggers: [
            {
              type: "political_event", // reuse closest existing type; signal source is technical
              description: triggerSummary,
              date: scannedAt,
              source: "market_data",
              relevanceScore: Math.min(1, volumeSpike / 5),
            },
          ],
          entryRange: null,
          expectedImpact: "high",
          impactTimeframe: "weeks",
          direction: "bearish",
          congressCluster: null,
          newsHeadlines: [],
          aiAnalysis: {
            thesis: `${candidate.symbol} is in a confirmed free-fall: price dropped ${Math.abs(priceChange5d).toFixed(1)}% over 5 days with volume ${volumeSpike.toFixed(1)}x the 20-day average, and RSI at ${rsi.toFixed(0)} (oversold). This may present a put option or short-sell opportunity for experienced traders.`,
            catalysts: [
              `5-day price decline: ${Math.abs(priceChange5d).toFixed(1)}%`,
              `Volume spike: ${volumeSpike.toFixed(1)}x 20-day average`,
              `RSI: ${rsi.toFixed(0)} (oversold)`,
            ],
            risks: [
              "Oversold conditions can produce violent snap-back rallies",
              "Short selling carries theoretically unlimited loss potential",
            ],
            suggestedDirection: "short",
            suggestedTimeframe: "swing",
            confidence: Math.min(90, 40 + Math.abs(priceChange5d) * 2),
            disclaimer:
              "Short positions and put options carry risk of significant loss. Short selling has theoretically unlimited loss potential. This is an AI-generated analysis for informational purposes only. It is not investment advice.",
          },
          riskScore: 8, // Free-fall signals are high risk by definition
          status: "new",
          promotedToRecommendationId: null,
          scannedAt,
          expiresAt,
        });
      } catch {
        // Skip errors for individual symbols
      }
    }

    return results;
  }
}

export const marketScanService = new MarketScanService();
