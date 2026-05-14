import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import type { RejectedScan, ScanResult } from "@/lib/db/models";
import { marketDataService } from "@/lib/services/market-data";

const PROFITABLE_THRESHOLD_PCT = 5;
const RESOLUTION_DAYS = 30;

export interface RejectionAccuracyStats {
  total: number;
  resolved: number;
  correctlyRejected: number;
  missedOpportunities: number;
  accuracyPct: number | null;
}

async function fetchPriceQuietly(symbol: string): Promise<number> {
  try {
    const q = await marketDataService.getQuote(symbol);
    return q.price;
  } catch {
    return 0;
  }
}

export class RejectedScanTracker {
  async recordAutoFilter(params: {
    scanId: string;
    userId: string | null;
    symbol: string;
    sector: string;
    triggerSummary: string;
    rejectionSource: "auto_filter" | "low_confidence";
    rejectionReason: string;
  }): Promise<void> {
    const price = await fetchPriceQuietly(params.symbol);
    if (price === 0) return; // skip if we can't get a price to track from

    const { rejectedScans } = await getCollections();
    const doc: Omit<RejectedScan, "_id"> = {
      userId: params.userId ? new ObjectId(params.userId) : null,
      scanId: params.scanId,
      symbol: params.symbol,
      rejectionSource: params.rejectionSource,
      rejectionReason: params.rejectionReason,
      priceAtRejection: price,
      snapshotAtRejection: {
        priceHistory7d: [],
        sector: params.sector,
        triggerSummary: params.triggerSummary,
      },
      tracking: {
        checkpoints: [],
        peakGainPct: 0,
        peakLossPct: 0,
        wouldHaveBeenProfitable: null,
      },
      resolvedAt: null,
      createdAt: new Date(),
    };

    await rejectedScans.insertOne(doc as RejectedScan);
  }

  async recordUserDismiss(params: {
    scanResultId: string;
    userId: string | null;
    scanResult: Pick<ScanResult, "scanId" | "symbol" | "sector" | "triggerSummary">;
  }): Promise<void> {
    const price = await fetchPriceQuietly(params.scanResult.symbol);
    if (price === 0) return;

    const { rejectedScans } = await getCollections();
    const doc: Omit<RejectedScan, "_id"> = {
      userId: params.userId ? new ObjectId(params.userId) : null,
      scanId: params.scanResult.scanId,
      symbol: params.scanResult.symbol,
      rejectionSource: "user_dismiss",
      rejectionReason: `User dismissed scan result ${params.scanResultId}`,
      priceAtRejection: price,
      snapshotAtRejection: {
        priceHistory7d: [],
        sector: params.scanResult.sector,
        triggerSummary: params.scanResult.triggerSummary,
      },
      tracking: {
        checkpoints: [],
        peakGainPct: 0,
        peakLossPct: 0,
        wouldHaveBeenProfitable: null,
      },
      resolvedAt: null,
      createdAt: new Date(),
    };

    await rejectedScans.insertOne(doc as RejectedScan);
  }

  async addDailyCheckpoints(): Promise<{ updated: number; resolved: number }> {
    const { rejectedScans } = await getCollections();
    const cutoff = new Date(Date.now() - RESOLUTION_DAYS * 86400_000);

    const unresolved = await rejectedScans
      .find({ resolvedAt: null, createdAt: { $gte: cutoff } })
      .toArray();

    let updated = 0;
    let resolved = 0;

    for (const doc of unresolved) {
      const price = await fetchPriceQuietly(doc.symbol);
      if (price === 0) continue;

      const changePct = ((price - doc.priceAtRejection) / doc.priceAtRejection) * 100;
      const checkpoint = { date: new Date(), price, changePct };

      const allChanges = [...doc.tracking.checkpoints.map((c) => c.changePct), changePct];
      const peakGainPct = Math.max(doc.tracking.peakGainPct, changePct);
      const peakLossPct = Math.min(doc.tracking.peakLossPct, changePct);

      const ageMs = Date.now() - doc.createdAt.getTime();
      const isExpired = ageMs >= RESOLUTION_DAYS * 86400_000;

      const finalChangePct = allChanges[allChanges.length - 1] ?? 0;
      const wouldHaveBeenProfitable = isExpired
        ? finalChangePct >= PROFITABLE_THRESHOLD_PCT
        : null;

      await rejectedScans.updateOne(
        { _id: doc._id },
        {
          $push: { "tracking.checkpoints": checkpoint },
          $set: {
            "tracking.peakGainPct": peakGainPct,
            "tracking.peakLossPct": peakLossPct,
            ...(isExpired && {
              "tracking.wouldHaveBeenProfitable": wouldHaveBeenProfitable,
              resolvedAt: new Date(),
            }),
          },
        }
      );

      updated++;
      if (isExpired) resolved++;
    }

    return { updated, resolved };
  }

  async getRejectionAccuracy(userId: string | null): Promise<RejectionAccuracyStats> {
    const { rejectedScans } = await getCollections();

    const query = userId
      ? { userId: new ObjectId(userId), resolvedAt: { $ne: null } }
      : { resolvedAt: { $ne: null } };

    const resolved = await rejectedScans.find(query).toArray();

    const correctlyRejected = resolved.filter(
      (r) => r.tracking.wouldHaveBeenProfitable === false
    ).length;
    const missedOpportunities = resolved.filter(
      (r) => r.tracking.wouldHaveBeenProfitable === true
    ).length;

    const total = await rejectedScans.countDocuments(
      userId ? { userId: new ObjectId(userId) } : {}
    );

    const accuracyPct =
      resolved.length >= 5
        ? Math.round((correctlyRejected / resolved.length) * 100)
        : null;

    return {
      total,
      resolved: resolved.length,
      correctlyRejected,
      missedOpportunities,
      accuracyPct,
    };
  }
}

export const rejectedScanTracker = new RejectedScanTracker();
