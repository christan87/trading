import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { Recommendation } from "@/lib/db/models";

export interface StrategyStats {
  strategyType: string;
  totalRecommendations: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPct: number;
  avgWinPct: number;
  avgLossPct: number;
  sharpeRatio: number | null;
  maxDrawdownPct: number;
  profitFactor: number | null;
  lastCalculatedAt: Date;
}

export interface PerformanceSummary {
  overall: StrategyStats;
  byStrategy: StrategyStats[];
  recentPerformance: {
    last30Days: { wins: number; losses: number; returnPct: number };
    last90Days: { wins: number; losses: number; returnPct: number };
  };
  topPerformingStrategy: string | null;
  worstPerformingStrategy: string | null;
}

function computeStats(
  strategyType: string,
  recs: Recommendation[]
): StrategyStats {
  const resolved = recs.filter((r) => r.outcome.status === "resolved");
  const wins: number[] = [];
  const losses: number[] = [];

  for (const rec of resolved) {
    const ret = rec.outcome.finalResult?.returnPct ?? null;
    if (ret === null) continue;
    if (ret > 0) wins.push(ret);
    else losses.push(ret);
  }

  const totalResolved = wins.length + losses.length;
  const winRate = totalResolved > 0 ? wins.length / totalResolved : 0;

  const allReturns = [...wins, ...losses];
  const avgReturnPct =
    allReturns.length > 0
      ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length
      : 0;

  const avgWinPct =
    wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

  // Sharpe ratio (simplified, assuming 0% risk-free rate)
  let sharpeRatio: number | null = null;
  if (allReturns.length >= 5) {
    const mean = avgReturnPct;
    const variance =
      allReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      allReturns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? mean / stdDev : null;
  }

  // Max drawdown — peak-to-trough on cumulative returns
  let peak = 0;
  let cumulative = 0;
  let maxDrawdownPct = 0;
  for (const r of allReturns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }

  const grossWins = wins.reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor =
    grossLosses > 0 ? grossWins / grossLosses : wins.length > 0 ? null : null;

  return {
    strategyType,
    totalRecommendations: recs.length,
    resolved: totalResolved,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgReturnPct,
    avgWinPct,
    avgLossPct,
    sharpeRatio,
    maxDrawdownPct,
    profitFactor,
    lastCalculatedAt: new Date(),
  };
}

export async function calculatePerformance(
  userId: string
): Promise<PerformanceSummary> {
  const { recommendations } = await getCollections();
  const uid = new ObjectId(userId);

  const all = (await recommendations
    .find({ userId: uid })
    .toArray()) as Recommendation[];

  const byStrategy = new Map<string, Recommendation[]>();
  for (const rec of all) {
    const key = rec.strategyType;
    if (!byStrategy.has(key)) byStrategy.set(key, []);
    byStrategy.get(key)!.push(rec);
  }

  const strategyStats = Array.from(byStrategy.entries()).map(([type, recs]) =>
    computeStats(type, recs)
  );

  const overall = computeStats("all", all);
  overall.strategyType = "all";

  // Recent performance windows
  const now = Date.now();
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms90 = 90 * 24 * 60 * 60 * 1000;

  function windowStats(windowMs: number) {
    const cutoff = new Date(now - windowMs);
    const recent = all.filter(
      (r) =>
        r.outcome.status === "resolved" &&
        r.outcome.finalResult != null &&
        new Date(r.createdAt) >= cutoff
    );
    const wins = recent.filter((r) => (r.outcome.finalResult?.returnPct ?? 0) > 0).length;
    const losses = recent.filter((r) => (r.outcome.finalResult?.returnPct ?? 0) <= 0).length;
    const returnPct =
      recent.length > 0
        ? recent.reduce((sum, r) => sum + (r.outcome.finalResult?.returnPct ?? 0), 0) /
          recent.length
        : 0;
    return { wins, losses, returnPct };
  }

  const sortedByWinRate = [...strategyStats].sort(
    (a, b) => b.winRate - a.winRate
  );
  const topPerformingStrategy =
    sortedByWinRate.length > 0 && sortedByWinRate[0].resolved >= 3
      ? sortedByWinRate[0].strategyType
      : null;
  const worstPerformingStrategy =
    sortedByWinRate.length > 1 &&
    sortedByWinRate[sortedByWinRate.length - 1].resolved >= 3
      ? sortedByWinRate[sortedByWinRate.length - 1].strategyType
      : null;

  return {
    overall,
    byStrategy: strategyStats,
    recentPerformance: {
      last30Days: windowStats(ms30),
      last90Days: windowStats(ms90),
    },
    topPerformingStrategy,
    worstPerformingStrategy,
  };
}

export async function updateStrategyDocument(userId: string): Promise<void> {
  const { strategies, recommendations } = await getCollections();
  const uid = new ObjectId(userId);

  const all = (await recommendations
    .find({ userId: uid })
    .toArray()) as Recommendation[];

  const byStrategy = new Map<string, Recommendation[]>();
  for (const rec of all) {
    const key = rec.strategyType;
    if (!byStrategy.has(key)) byStrategy.set(key, []);
    byStrategy.get(key)!.push(rec);
  }

  for (const [type, recs] of byStrategy.entries()) {
    const stats = computeStats(type, recs);
    await strategies.updateOne(
      { userId: uid, type },
      {
        $set: {
          "performance.totalRecommendations": stats.totalRecommendations,
          "performance.wins": stats.wins,
          "performance.losses": stats.losses,
          "performance.winRate": stats.winRate,
          "performance.avgReturnPct": stats.avgReturnPct,
          "performance.sharpeRatio": stats.sharpeRatio,
          "performance.maxDrawdownPct": stats.maxDrawdownPct,
          "performance.lastCalculatedAt": stats.lastCalculatedAt,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: uid,
          name: type.replace(/_/g, " "),
          type,
          parameters: {},
          status: "active",
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
}
