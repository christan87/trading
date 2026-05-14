import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { getCollections } from "@/lib/db/mongodb";
import { aiFallbackManager } from "./ai-fallback";
import { newsService } from "./news";
import { congressService } from "./congress";
import { marketDataService } from "./market-data";
import { calculateTier1Risk, combineTiers, type Tier1Input } from "./risk-assessor";
import { STRATEGY_SYSTEM_PROMPT, buildStrategyPrompt } from "@/lib/prompts/strategy";
import { PENNY_STOCK_SYSTEM_PROMPT, buildPennyStockPrompt } from "@/lib/prompts/penny-stock";
import type { Recommendation } from "@/lib/db/models";
import { ObjectId } from "mongodb";
import { rateLimiter } from "@/lib/utils/rate-limiter";
import { decrypt } from "@/lib/utils/encryption";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface StrategyRequest {
  userId: string;
  symbol: string;
  timeframe: "intraday" | "swing" | "position";
  strategyType?: string;
  alpacaToken?: string;
}

interface ClaudeRecommendationOutput {
  symbol: string;
  assetType: "equity" | "option";
  strategyType: string;
  timeframe: "intraday" | "swing" | "position";
  direction: "long" | "short";
  entry: { price: number; condition: string };
  target: { price: number; expectedReturnPct: number };
  stopLoss: { price: number; maxLossPct: number };
  optionDetails: {
    contractType: "call" | "put";
    suggestedStrike: number;
    suggestedExpiration: string;
    suggestedStrategy: string;
  } | null;
  dataDrivenRisk: { score: number; factors: string[]; methodology: string };
  confidence: number;
  rationale: string;
}

async function getMacroIndicators(): Promise<Record<string, number>> {
  const FRED_KEY = process.env.FRED_API_KEY;
  if (!FRED_KEY) return {};

  const series = ["DFF", "DGS10", "VIXCLS", "CPIAUCSL"];
  const result: Record<string, number> = {};

  for (const id of series) {
    try {
      await rateLimiter.checkAndIncrement("fred");
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=1`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const val = parseFloat(data.observations?.[0]?.value);
      if (!isNaN(val)) result[id.toLowerCase()] = val;
    } catch {
      // Skip individual indicator failures
    }
  }

  return result;
}

async function getUserContext(userId: string) {
  const { users, strategies } = await getCollections();
  const { ObjectId: OId } = await import("mongodb");
  const user = await users.findOne({ _id: new OId(userId) });
  const strategyDocs = await strategies
    .find({ userId: new OId(userId), status: { $in: ["active", "paper"] } })
    .toArray();

  const strategyHistory = strategyDocs.map((s) => ({
    strategyType: s.type,
    winRate: s.performance.winRate,
    avgReturnPct: s.performance.avgReturnPct,
    totalTrades: s.performance.totalRecommendations,
  }));

  return { user, strategyHistory };
}

export async function runStrategyEngine(
  req: StrategyRequest
): Promise<{ recommendationId: string } | { error: string; tier1Only?: boolean }> {
  const start = Date.now();

  try {
    // Gather all context in parallel
    const [bars, macroIndicators, news, congressTrades, insiderPurchases, { user, strategyHistory }] =
      await Promise.all([
        marketDataService.getBars(req.symbol, "1Day", 30),
        getMacroIndicators(),
        newsService.getNewsForSymbols([req.symbol], req.alpacaToken),
        congressService.getTradesForSymbol(req.symbol, 90),
        congressService.getInsiderPurchases(req.symbol, 90),
        getUserContext(req.userId),
      ]);

    if (!user) return { error: "User not found" };

    let currentQuote: Awaited<ReturnType<typeof marketDataService.getQuote>>;
    try {
      currentQuote = await marketDataService.getQuote(req.symbol);
    } catch (err) {
      return { error: String(err).replace("Error: ", "") };
    }
    const currentPrice = currentQuote.price;

    // Build technical indicators from bars
    const closes = bars.map((b) => b.close);
    const sma50 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length) : currentPrice;
    const gains = closes.slice(1).map((c, i) => Math.max(0, c - closes[i]));
    const losses = closes.slice(1).map((c, i) => Math.max(0, closes[i] - c));
    const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    const technicalIndicators: Record<string, number> = {
      sma20: sma50,
      rsi: Math.round(rsi * 100) / 100,
      currentPrice,
    };

    const vix = macroIndicators.vixcls ?? currentQuote.volume > 0 ? 18 : 20;
    const avgVolume = bars.length > 0
      ? bars.reduce((s, b) => s + b.volume, 0) / bars.length
      : 1_000_000;
    const riskProfile = user.riskProfile ?? { maxPositionSizePct: 5, defaultStopLossPct: 2, roiTargetMonthlyPct: 25, optionsApprovalLevel: 1 };
    const preferences = user.preferences ?? { tipsEnabled: true, learningModeEnabled: true, aiEnabled: true };
    const positionSizePct = riskProfile.maxPositionSizePct;
    const tradingWithTrend = currentPrice >= sma50;

    // Tier 1 risk (always runs — no AI needed)
    const tier1Input: Tier1Input = {
      symbol: req.symbol,
      assetType: "equity",
      vix,
      avgDailyVolume: avgVolume,
      positionSizePct,
      tradingWithTrend,
      earningsInDays: null,
    };
    const tier1 = calculateTier1Risk(tier1Input);

    const aiStatus = await aiFallbackManager.getAiStatus();
    const useAI = aiStatus !== "unavailable" && preferences.aiEnabled;

    let claudeOutput: ClaudeRecommendationOutput | null = null;

    if (useAI) {
      const portfolioEquity = 100_000; // Will be replaced with real account data when available
      const isPennyStock = req.strategyType === "penny_stock";

      // Compute penny-specific metrics when needed
      const volumeSpike =
        bars.length >= 2 && avgVolume > 0
          ? (bars[bars.length - 1]?.volume ?? 0) / avgVolume
          : 0;
      const closes20 = bars.slice(-20).map((b) => b.close);
      const priceChange1d =
        closes20.length >= 2
          ? ((closes20[closes20.length - 1] - closes20[closes20.length - 2]) / closes20[closes20.length - 2]) * 100
          : 0;
      const priceChange5d =
        closes20.length >= 6
          ? ((closes20[closes20.length - 1] - closes20[closes20.length - 6]) / closes20[closes20.length - 6]) * 100
          : 0;
      const priceChange20d =
        closes20.length >= 2
          ? ((closes20[closes20.length - 1] - closes20[0]) / closes20[0]) * 100
          : 0;

      const congressSignal = await congressService.getClusterSignal(req.symbol).catch(() => null);

      const promptText = isPennyStock
        ? buildPennyStockPrompt({
            symbol: req.symbol,
            price: currentPrice,
            priceChange1d,
            priceChange5d,
            priceChange20d,
            volumeSpike,
            avgVolume20d: avgVolume,
            exchange: "NASDAQ/NYSE",
            news: news.map((n) => ({ headline: n.headline, sentiment: n.sentiment })),
            insiderTrades: insiderPurchases.map((t) => ({ name: t.name, shares: t.shares, value: t.value })),
            congressSignal: congressSignal?.signal ?? "neutral",
            portfolioEquity,
          })
        : buildStrategyPrompt({
        symbol: req.symbol,
        timeframe: req.timeframe,
        strategyType: req.strategyType,
        priceData: { currentPrice, bars, technicalIndicators },
        news: news.map((n) => ({
          headline: n.headline,
          summary: n.summary,
          source: n.sourceApi,
          publishedAt: n.publishedAt.toISOString(),
          sentiment: n.sentiment,
        })),
        congressTrades: congressTrades.map((t) => ({
          memberName: t.memberName,
          party: t.party,
          transactionType: t.transactionType,
          amountRange: t.amountRange,
          tradeDate: t.tradeDate.toISOString().split("T")[0],
        })),
        insiderTrades: insiderPurchases.map((t) => ({
          name: t.name,
          shares: t.shares,
          value: t.value,
          transactionDate: t.transactionDate.toISOString().split("T")[0],
        })),
        macroIndicators,
        marketConditions: { spyChange30d: 0, vix, sectorPerformance: {} },
        portfolioContext: {
          totalEquity: portfolioEquity,
          buyingPower: portfolioEquity * 0.5,
          existingPositions: [],
        },
        strategyHistory,
        riskProfile,
      });

      try {
        await rateLimiter.checkAndIncrement("anthropic");

        const response = await client.messages.create({
          model: isPennyStock ? "claude-sonnet-4-6" : "claude-opus-4-7",
          max_tokens: 2048,
          system: [
            {
              type: "text",
              text: isPennyStock ? PENNY_STOCK_SYSTEM_PROMPT : STRATEGY_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: promptText }],
        });

        const rawText =
          response.content[0].type === "text" ? response.content[0].text : "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          claudeOutput = JSON.parse(jsonMatch[0]) as ClaudeRecommendationOutput;
        }

        await aiFallbackManager.recordCall(true, Date.now() - start);
      } catch (err) {
        await aiFallbackManager.recordCall(false, Date.now() - start);
        console.error("[strategy-engine] Claude API error:", err);
        // Fall through — will use Tier 1 only
      }
    }

    const tier2 = claudeOutput
      ? claudeOutput.dataDrivenRisk
      : null;

    const { datadriven, combined } = combineTiers(tier1, tier2);

    const promptTemplate = buildStrategyPrompt({
      symbol: req.symbol,
      timeframe: req.timeframe,
      priceData: { currentPrice, bars: [], technicalIndicators },
      news: [],
      congressTrades: [],
      macroIndicators: {},
      marketConditions: { spyChange30d: 0, vix, sectorPerformance: {} },
      portfolioContext: { totalEquity: 0, buyingPower: 0, existingPositions: [] },
      strategyHistory: [],
      riskProfile,
    });

    const promptHash = createHash("sha256").update(promptTemplate).digest("hex").slice(0, 16);

    const recommendation: Omit<Recommendation, "_id"> = {
      userId: new ObjectId(req.userId),
      symbol: claudeOutput?.symbol ?? req.symbol,
      assetType: claudeOutput?.assetType ?? "equity",
      strategyType: claudeOutput?.strategyType ?? req.strategyType ?? "manual",
      timeframe: claudeOutput?.timeframe ?? req.timeframe,
      direction: claudeOutput?.direction ?? "long",
      entry: claudeOutput?.entry ?? { price: currentPrice, condition: "At market" },
      target: claudeOutput?.target ?? {
        price: currentPrice * 1.05,
        expectedReturnPct: 5,
      },
      stopLoss: claudeOutput?.stopLoss ?? {
        price: currentPrice * (1 - riskProfile.defaultStopLossPct / 100),
        maxLossPct: riskProfile.defaultStopLossPct,
      },
      optionDetails: claudeOutput?.optionDetails
        ? {
            ...claudeOutput.optionDetails,
            suggestedExpiration: new Date(claudeOutput.optionDetails.suggestedExpiration),
          }
        : null,
      risk: { bestPractices: tier1, datadriven, combined },
      confidence: claudeOutput?.confidence ?? 0,
      rationale:
        claudeOutput?.rationale ??
        (useAI
          ? "AI analysis failed — showing rules-based risk only."
          : "AI is disabled. Rules-based Tier 1 risk assessment only."),
      snapshot: {
        priceData: { currentPrice, priceHistory30d: bars.map((b) => ({ date: b.timestamp, ohlcv: [b.open, b.high, b.low, b.close, b.volume] })), technicalIndicators },
        newsArticles: news.map((n) => ({
          headline: n.headline,
          summary: n.summary,
          source: n.sourceApi,
          publishedAt: n.publishedAt,
          sentiment: n.sentiment,
        })),
        congressTrades: congressTrades.map((t) => ({
          memberName: t.memberName,
          party: t.party,
          transactionType: t.transactionType,
          amountRange: t.amountRange,
          tradeDate: t.tradeDate,
        })),
        macroIndicators,
        marketConditions: { spyChange30d: 0, vix, sectorPerformance: {} },
        claudePromptHash: promptHash,
        claudeModelVersion: claudeOutput ? "claude-opus-4-5" : "none",
        promptTemplate,
      },
      outcome: {
        status: "pending",
        checkpoints: [],
        finalResult: null,
        performedAsExpected: null,
        postMortem: null,
      },
      createdAt: new Date(),
    };

    const { recommendations } = await getCollections();
    const result = await recommendations.insertOne(recommendation as Recommendation);
    return { recommendationId: result.insertedId.toString() };
  } catch (err) {
    console.error("[strategy-engine]", err);
    return { error: String(err) };
  }
}
