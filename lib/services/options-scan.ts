import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";
import { marketDataService, type OptionsContract } from "@/lib/services/market-data";
import { congressService } from "@/lib/services/congress";
import { calculateTier1Risk } from "@/lib/services/risk-assessor";
import type { ScanResult } from "@/lib/db/models";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sp500: { symbol: string; name: string; sector: string }[] = require("@/data/sp500.json");

const OPTIONS_SCAN_DAILY_LIMIT = 3;
const OPTIONS_SCAN_MAX_TICKERS = 20;
const SCAN_EXPIRY_DAYS = 7;

export type OptionsStrategyType =
  | "covered_call"
  | "cash_secured_put"
  | "bull_call_spread"
  | "protective_put";

export interface OptionsScanParams {
  strategyType: OptionsStrategyType;
  minOpenInterest: number;
  maxDTE: number;
  minIVPercentile: number;   // 0-100; skipped when IV data unavailable
  tickers?: string[];        // if empty, use first 20 S&P 500 by position
}

export interface OptionsScanSummary {
  scanId: string;
  candidatesFound: number;
  planLimited: boolean;      // true when Alpaca Basic plan blocks snapshot data
  scannedAt: Date;
  rateLimited?: boolean;
  scansRemainingToday: number;
}

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function daysToExpiration(expiration: string): number {
  return Math.max(
    0,
    Math.round((new Date(expiration).getTime() - Date.now()) / 86400_000)
  );
}

function computeIVRank(iv: number, allIVs: number[]): number {
  if (allIVs.length === 0) return 50;
  const min = Math.min(...allIVs);
  const max = Math.max(...allIVs);
  if (max === min) return 50;
  return Math.round(((iv - min) / (max - min)) * 100);
}

// Which contracts to consider for each strategy
function filterByStrategy(
  contracts: OptionsContract[],
  strategy: OptionsStrategyType,
  currentPrice: number,
  maxDTE: number,
  minOI: number
): OptionsContract[] {
  const now = Date.now();

  return contracts.filter((c) => {
    const dte = daysToExpiration(c.expiration_date);
    if (dte > maxDTE || dte < 7) return false;
    if (c.open_interest < minOI) return false;

    const moneyness = c.strike_price / currentPrice;

    switch (strategy) {
      case "covered_call":
        // OTM calls: strike 1-10% above current price, DTE 14-45
        return c.type === "call" && moneyness >= 1.01 && moneyness <= 1.10 && dte <= 45;
      case "cash_secured_put":
        // OTM puts: strike 3-10% below current price, DTE 14-45
        return c.type === "put" && moneyness >= 0.90 && moneyness <= 0.97 && dte <= 45;
      case "bull_call_spread":
        // ATM to slightly OTM calls: DTE 14-60
        return c.type === "call" && moneyness >= 0.97 && moneyness <= 1.08 && dte <= 60;
      case "protective_put":
        // OTM puts 5-15% below current price, DTE 30-90
        return c.type === "put" && moneyness >= 0.85 && moneyness <= 0.95 && dte >= 30;
      default:
        return false;
    }
  });
}

function scoreContract(
  contract: OptionsContract,
  allIVs: number[],
  underlyingMomentum: number,  // positive = bullish, negative = bearish
  strategy: OptionsStrategyType,
  congressBullish: boolean,
  insiderCount: number
): number {
  let score = 50; // baseline

  // IV rank scoring — selling strategies prefer high IV rank
  if (contract.implied_volatility !== null) {
    const ivRank = computeIVRank(contract.implied_volatility, allIVs);
    if (strategy === "covered_call" || strategy === "cash_secured_put") {
      score += (ivRank - 50) * 0.4; // reward high IV rank for selling
    } else {
      score -= (ivRank - 50) * 0.2; // buying strategies prefer lower IV
    }
  }

  // Volume/OI ratio — higher = more active market
  if (contract.open_interest > 0 && contract.volume > 0) {
    const voiRatio = contract.volume / contract.open_interest;
    score += Math.min(10, voiRatio * 20);
  }

  // Bid-ask spread — tighter is better
  if (contract.ask > 0 && contract.bid >= 0) {
    const spreadPct = (contract.ask - contract.bid) / contract.ask;
    score -= Math.min(20, spreadPct * 100);
  }

  // Underlying momentum alignment with strategy
  const bullishStrategy = strategy === "covered_call" || strategy === "bull_call_spread";
  if (bullishStrategy && underlyingMomentum > 0) score += 5;
  if (!bullishStrategy && underlyingMomentum < 0) score += 5;

  // Congressional signal
  if (congressBullish) {
    if (bullishStrategy) score += 8;
    else score -= 5;
  }

  // Insider buying
  score += Math.min(10, insiderCount * 3);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export class OptionsScanService {
  async checkDailyLimit(): Promise<{ allowed: boolean; remaining: number }> {
    const redis = getRedis();
    const key = REDIS_KEYS.optionsScanCount(todayKey());
    const count = (await redis.get<number>(key)) ?? 0;
    return {
      allowed: count < OPTIONS_SCAN_DAILY_LIMIT,
      remaining: OPTIONS_SCAN_DAILY_LIMIT - count,
    };
  }

  private async incrementDailyCount(): Promise<void> {
    const redis = getRedis();
    const key = REDIS_KEYS.optionsScanCount(todayKey());
    const current = (await redis.get<number>(key)) ?? 0;
    await redis.set(key, current + 1, { ex: 86400 });
  }

  async runOptionsScan(params: OptionsScanParams): Promise<OptionsScanSummary> {
    const { allowed, remaining } = await this.checkDailyLimit();
    if (!allowed) {
      return {
        scanId: "",
        candidatesFound: 0,
        planLimited: false,
        scannedAt: new Date(),
        rateLimited: true,
        scansRemainingToday: 0,
      };
    }

    await this.incrementDailyCount();

    const scanId = new ObjectId().toHexString();
    const scannedAt = new Date();
    const expiresAt = new Date(Date.now() + SCAN_EXPIRY_DAYS * 86400_000);

    const tickers = this.selectTickers(params.tickers);
    const results: Omit<ScanResult, "_id">[] = [];
    let anyPlanLimited = false;

    for (const symbol of tickers) {
      try {
        const result = await this.analyzeTicker(
          symbol, params, scanId, scannedAt, expiresAt
        );
        if (result === "plan_limited") {
          anyPlanLimited = true;
          continue;
        }
        if (result) results.push(result);
      } catch {
        // Skip tickers that error
      }
    }

    if (results.length > 0) {
      const { scanResults } = await getCollections();
      await scanResults.insertMany(results as ScanResult[]);
    }

    return {
      scanId,
      candidatesFound: results.length,
      planLimited: anyPlanLimited,
      scannedAt,
      scansRemainingToday: remaining - 1,
    };
  }

  private selectTickers(tickers?: string[]): string[] {
    if (tickers && tickers.length > 0) {
      return tickers.slice(0, OPTIONS_SCAN_MAX_TICKERS);
    }
    return sp500.slice(0, OPTIONS_SCAN_MAX_TICKERS).map((s) => s.symbol);
  }

  private async analyzeTicker(
    symbol: string,
    params: OptionsScanParams,
    scanId: string,
    scannedAt: Date,
    expiresAt: Date
  ): Promise<Omit<ScanResult, "_id"> | null | "plan_limited"> {
    const stockInfo = sp500.find((s) => s.symbol === symbol);
    const companyName = stockInfo?.name ?? symbol;
    const sector = stockInfo?.sector ?? "Unknown";

    // Fetch current price and 20-day bars in parallel
    const [quote, bars] = await Promise.all([
      marketDataService.getQuote(symbol).catch(() => null),
      marketDataService.getBars(symbol, "1Day", 20).catch(() => []),
    ]);
    if (!quote) return null;
    const currentPrice = quote.price;

    // Compute underlying momentum from bars (% change over 20 days)
    const closes = bars.map((b) => b.close);
    const underlyingMomentum =
      closes.length >= 2
        ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
        : 0;

    // Try snapshot first (includes IV/bid/ask), fall back to contracts endpoint
    const { contracts: snapshotContracts, planLimited } =
      await marketDataService.getOptionsChain(symbol);

    let rawContracts: OptionsContract[];
    if (planLimited) {
      // Basic plan: use contracts endpoint (no IV/bid/ask)
      const maxExpiry = new Date(Date.now() + params.maxDTE * 86400_000)
        .toISOString()
        .split("T")[0];
      rawContracts = await marketDataService.getOptionsContracts(symbol, {
        expirationBefore: maxExpiry,
      });
    } else {
      rawContracts = snapshotContracts;
    }

    if (rawContracts.length === 0) return planLimited ? "plan_limited" : null;

    // Filter by strategy
    const filtered = filterByStrategy(
      rawContracts, params.strategyType, currentPrice, params.maxDTE, params.minOpenInterest
    );
    if (filtered.length === 0) return null;

    // Compute IV rank if we have IV data
    const allIVs = rawContracts
      .map((c) => c.implied_volatility)
      .filter((v): v is number => v !== null);

    // Apply minIVPercentile filter only when IV data is available
    let candidates = filtered;
    if (allIVs.length > 0 && params.minIVPercentile > 0) {
      candidates = filtered.filter((c) => {
        if (c.implied_volatility === null) return true;
        return computeIVRank(c.implied_volatility, allIVs) >= params.minIVPercentile;
      });
      if (candidates.length === 0) return null;
    }

    // Get congress and insider signals
    const [congressClusterResult, insiderPurchases] = await Promise.all([
      congressService.getClusterSignal(symbol).catch(() => null),
      congressService.getInsiderPurchases(symbol, 60).catch(() => []),
    ]);

    const congressBullish = congressClusterResult?.signal === "bullish";

    // Pick the best-scoring contract
    const scored = candidates.map((c) => ({
      contract: c,
      score: scoreContract(
        c, allIVs, underlyingMomentum, params.strategyType, congressBullish, insiderPurchases.length
      ),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return null;

    const contract = best.contract;
    const dte = daysToExpiration(contract.expiration_date);

    // Tier 1 risk
    const avgVolume = bars.length > 0
      ? bars.reduce((s, b) => s + b.volume, 0) / bars.length
      : 1_000_000;
    const sma20 = closes.length >= 1 ? closes.reduce((a, b) => a + b, 0) / closes.length : currentPrice;
    const tier1 = calculateTier1Risk({
      symbol,
      assetType: "option",
      daysToExpiration: dte,
      earningsInDays: null,
      vix: 20,
      avgDailyVolume: avgVolume,
      positionSizePct: 2,
      tradingWithTrend: currentPrice >= sma20,
    });

    const ivRank = contract.implied_volatility !== null && allIVs.length > 0
      ? computeIVRank(contract.implied_volatility, allIVs)
      : null;

    const voiRatio = contract.open_interest > 0 && contract.volume > 0
      ? contract.volume / contract.open_interest
      : null;

    const spreadPct = contract.ask > 0
      ? (contract.ask - contract.bid) / contract.ask
      : null;

    const congressCluster =
      congressClusterResult && congressClusterResult.signal !== "neutral"
        ? {
            purchases: congressClusterResult.purchases,
            sales: congressClusterResult.sales,
            members: [],
            direction: congressClusterResult.signal as "bullish" | "bearish" | "neutral",
            windowDays: 90,
          }
        : null;

    const strategyLabel = params.strategyType.replace(/_/g, " ");
    const thesis = `${contract.type.toUpperCase()} option — ${strategyLabel} on ${symbol}. ` +
      `Strike $${contract.strike_price} expiring ${contract.expiration_date} (${dte}d). ` +
      (ivRank !== null ? `IV rank ${ivRank}/100. ` : "IV data unavailable on current plan. ") +
      `Score: ${best.score}/100.`;

    return {
      userId: null,
      scanId,
      triggerType: "manual",
      triggerSummary: `Options scan: ${strategyLabel}`,
      symbol,
      companyName,
      sector,
      industry: sector,
      triggers: [
        {
          type: "political_event",
          description: `${strategyLabel} opportunity — score ${best.score}/100`,
          date: scannedAt,
          source: "options_scan",
          relevanceScore: best.score / 100,
        },
      ],
      entryRange: {
        min: contract.bid,
        max: contract.ask,
        currentPrice,
        rationale: `${contract.type} at strike $${contract.strike_price}, expires ${contract.expiration_date}`,
      },
      expectedImpact: best.score >= 70 ? "high" : best.score >= 50 ? "moderate" : "low",
      impactTimeframe: dte <= 14 ? "days" : dte <= 45 ? "weeks" : "months",
      direction: params.strategyType.includes("put") ? "bearish" : "bullish",
      congressCluster,
      newsHeadlines: [],
      aiAnalysis: {
        thesis,
        catalysts: [
          `Strategy: ${strategyLabel}`,
          ...(ivRank !== null && ivRank >= 50
            ? [`IV rank ${ivRank}/100 — elevated premium`]
            : []),
          ...(insiderPurchases.length > 0
            ? [`${insiderPurchases.length} insider purchase(s) in last 60 days`]
            : []),
        ],
        risks: [
          `${dte} days to expiration`,
          ...(spreadPct !== null && spreadPct > 0.1 ? [`Wide bid-ask spread (${(spreadPct * 100).toFixed(1)}%)`] : []),
          ...(planLimited ? ["IV and bid/ask data unavailable — Alpaca Basic plan"] : []),
        ],
        suggestedDirection:
          params.strategyType === "covered_call" || params.strategyType === "bull_call_spread"
            ? "long"
            : "short",
        suggestedTimeframe: dte <= 14 ? "intraday" : dte <= 45 ? "swing" : "position",
        confidence: best.score,
        disclaimer:
          "This is an AI-generated analysis for informational purposes only. It is not investment advice.",
      },
      riskScore: tier1.score,
      status: "new",
      promotedToRecommendationId: null,
      scannedAt,
      expiresAt,
      assetType: "option",
      optionScanDetails: {
        contractSymbol: contract.symbol,
        contractType: contract.type,
        strike: contract.strike_price,
        expiration: contract.expiration_date,
        daysToExpiration: dte,
        impliedVolatility: contract.implied_volatility,
        ivRank,
        volumeOiRatio: voiRatio,
        spreadPct,
        openInterest: contract.open_interest,
        optionStrategy: params.strategyType,
      },
    };
  }

  async getLatestResults(limit = 20): Promise<ScanResult[]> {
    const { scanResults } = await getCollections();
    return scanResults
      .find({
        assetType: "option",
        status: { $ne: "dismissed" },
        expiresAt: { $gt: new Date() },
      })
      .sort({ scannedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getRecentRunIds(
    limit = 5
  ): Promise<{ scanId: string; scannedAt: Date; count: number }[]> {
    const { scanResults } = await getCollections();
    const pipeline = [
      { $match: { assetType: "option" } },
      { $sort: { scannedAt: -1 } },
      { $group: { _id: "$scanId", scannedAt: { $first: "$scannedAt" }, count: { $sum: 1 } } },
      { $sort: { scannedAt: -1 } },
      { $limit: limit },
      { $project: { scanId: "$_id", scannedAt: 1, count: 1, _id: 0 } },
    ];
    return scanResults
      .aggregate<{ scanId: string; scannedAt: Date; count: number }>(pipeline)
      .toArray();
  }
}

export const optionsScanService = new OptionsScanService();
