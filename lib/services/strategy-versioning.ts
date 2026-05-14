import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import type { Strategy } from "@/lib/db/models";

export interface StrategyVersion {
  versionNumber: number;
  parameters: Record<string, unknown>;
  performance: Strategy["performance"];
  peakRoiPct: number;
  avgRoiPct: number;
  activeFrom: Date;
  activeTo: Date;
  updateReason: string;
}

function computePeakAndAvgRoi(performance: Strategy["performance"]): {
  peakRoiPct: number;
  avgRoiPct: number;
} {
  // avgReturnPct is already the per-trade average; use winRate * avgReturnPct as a
  // rough monthly-equivalent ROI for display purposes.
  const avgRoiPct = performance.avgReturnPct;
  const peakRoiPct = performance.wins > 0
    ? performance.avgReturnPct * (1 + performance.winRate)
    : 0;
  return { peakRoiPct: Math.round(peakRoiPct * 100) / 100, avgRoiPct: Math.round(avgRoiPct * 100) / 100 };
}

export async function applyStrategyUpdate(
  userId: string,
  strategyType: string,
  newParameters: Record<string, unknown>,
  updateReason: string
): Promise<void> {
  const { strategies } = await getCollections();
  const uid = new ObjectId(userId);

  const existing = await strategies.findOne({ userId: uid, type: strategyType });
  if (!existing) throw new Error(`Strategy ${strategyType} not found for user`);

  const now = new Date();
  const currentVersion = existing.currentVersion ?? 1;
  const activeFrom = existing.updatedAt ?? existing.createdAt;

  const { peakRoiPct, avgRoiPct } = computePeakAndAvgRoi(existing.performance);

  const versionSnapshot: StrategyVersion = {
    versionNumber: currentVersion,
    parameters: existing.parameters,
    performance: existing.performance,
    peakRoiPct,
    avgRoiPct,
    activeFrom,
    activeTo: now,
    updateReason,
  };

  await strategies.updateOne(
    { userId: uid, type: strategyType },
    {
      $set: {
        parameters: newParameters,
        currentVersion: currentVersion + 1,
        updatedAt: now,
      },
      $push: { versions: versionSnapshot },
    }
  );
}

export async function revertToVersion(
  userId: string,
  strategyType: string,
  versionNumber: number,
  revertReason: string
): Promise<void> {
  const { strategies } = await getCollections();
  const uid = new ObjectId(userId);

  const existing = await strategies.findOne({ userId: uid, type: strategyType });
  if (!existing) throw new Error(`Strategy ${strategyType} not found for user`);

  const target = (existing.versions ?? []).find((v) => v.versionNumber === versionNumber);
  if (!target) throw new Error(`Version ${versionNumber} not found`);

  const now = new Date();
  const currentVersion = existing.currentVersion ?? 1;
  const { peakRoiPct, avgRoiPct } = computePeakAndAvgRoi(existing.performance);

  const currentSnapshot: StrategyVersion = {
    versionNumber: currentVersion,
    parameters: existing.parameters,
    performance: existing.performance,
    peakRoiPct,
    avgRoiPct,
    activeFrom: existing.updatedAt ?? existing.createdAt,
    activeTo: now,
    updateReason: `Replaced by revert to v${versionNumber}: ${revertReason}`,
  };

  await strategies.updateOne(
    { userId: uid, type: strategyType },
    {
      $set: {
        parameters: target.parameters,
        currentVersion: currentVersion + 1,
        updatedAt: now,
      },
      $push: { versions: currentSnapshot },
    }
  );
}

export async function getStrategyWithVersions(
  userId: string
): Promise<Strategy[]> {
  const { strategies } = await getCollections();
  const uid = new ObjectId(userId);
  return strategies.find({ userId: uid }).toArray();
}
