import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { Recommendation, User } from "@/lib/db/models";

export interface MonthlyPnL {
  month: string; // "YYYY-MM"
  returnPct: number;
  wins: number;
  losses: number;
  totalTrades: number;
}

export interface RoiData {
  targetMonthlyPct: number;
  currentMonthReturnPct: number;
  currentMonthWins: number;
  currentMonthLosses: number;
  currentMonthTrades: number;
  progressTowardTarget: number; // 0-100
  projectedMonthEndPct: number | null;
  last6Months: MonthlyPnL[];
  allTimeReturnPct: number;
  allTimeTrades: number;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function getRoiData(userId: string): Promise<RoiData> {
  const { recommendations, users } = await getCollections();
  const uid = new ObjectId(userId);

  const user = (await users.findOne({ _id: uid })) as User | null;
  const targetMonthlyPct = user?.riskProfile?.roiTargetMonthlyPct ?? 25;

  const resolved = (await recommendations
    .find({
      userId: uid,
      "outcome.status": "resolved",
      "outcome.finalResult": { $ne: null },
    })
    .toArray()) as Recommendation[];

  const now = new Date();
  const currentMonth = monthKey(now);

  // Group by month
  const byMonth = new Map<string, { returnPct: number; wins: number; losses: number }>();

  for (const rec of resolved) {
    const closedAt = rec.outcome.finalResult
      ? new Date(rec.createdAt)
      : null;
    if (!closedAt) continue;

    const key = monthKey(closedAt);
    if (!byMonth.has(key)) {
      byMonth.set(key, { returnPct: 0, wins: 0, losses: 0 });
    }
    const entry = byMonth.get(key)!;
    const ret = rec.outcome.finalResult!.returnPct;
    entry.returnPct += ret;
    if (ret > 0) entry.wins++;
    else entry.losses++;
  }

  // Last 6 months
  const last6Months: MonthlyPnL[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    const data = byMonth.get(key) ?? { returnPct: 0, wins: 0, losses: 0 };
    last6Months.push({
      month: key,
      returnPct: data.returnPct,
      wins: data.wins,
      losses: data.losses,
      totalTrades: data.wins + data.losses,
    });
  }

  const currentMonthData = byMonth.get(currentMonth) ?? {
    returnPct: 0,
    wins: 0,
    losses: 0,
  };

  const progressTowardTarget =
    targetMonthlyPct > 0
      ? Math.min(
          100,
          Math.max(0, (currentMonthData.returnPct / targetMonthlyPct) * 100)
        )
      : 0;

  // Project month-end based on trading pace
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let projectedMonthEndPct: number | null = null;
  const currentTrades = currentMonthData.wins + currentMonthData.losses;
  if (dayOfMonth > 3 && currentTrades > 0) {
    const paceFactor = daysInMonth / dayOfMonth;
    projectedMonthEndPct = currentMonthData.returnPct * paceFactor;
  }

  const allTimeReturnPct = resolved.reduce(
    (sum, r) => sum + (r.outcome.finalResult?.returnPct ?? 0),
    0
  );

  return {
    targetMonthlyPct,
    currentMonthReturnPct: currentMonthData.returnPct,
    currentMonthWins: currentMonthData.wins,
    currentMonthLosses: currentMonthData.losses,
    currentMonthTrades: currentTrades,
    progressTowardTarget,
    projectedMonthEndPct,
    last6Months,
    allTimeReturnPct,
    allTimeTrades: resolved.length,
  };
}
