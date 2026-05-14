import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/mongodb";
import { marketScanService } from "@/lib/services/market-scan";
import { pennyStockScanService } from "@/lib/services/penny-stock-scan";
import { optionsScanService } from "@/lib/services/options-scan";
import { ObjectId } from "mongodb";

const INTERVAL_MS: Record<string, number> = {
  "6h": 6 * 3600_000,
  "12h": 12 * 3600_000,
  "24h": 24 * 3600_000,
  "48h": 48 * 3600_000,
};

// Cost estimate per scan type (in USD cents, approximate)
const SCAN_COST_CENTS: Record<string, number> = {
  market: 8,   // ~$0.08 — Claude Opus + Sonnet calls
  penny: 3,    // ~$0.03 — Claude Sonnet only
  options: 0,  // No Claude calls — scoring is deterministic
};

export async function POST(request: Request) {
  const secret = request.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { users } = await getCollections();

  // Find users with an active scan schedule
  const scheduledUsers = await users
    .find({ "preferences.scanSchedule.interval": { $ne: "disabled", $exists: true } })
    .project<{
      _id: ObjectId;
      "preferences.scanSchedule": {
        interval: string;
        enabledTypes: string[];
        lastRunAt?: Date;
      };
    }>({ "preferences.scanSchedule": 1 })
    .toArray();

  let totalScansTriggered = 0;
  const results: { userId: string; types: string[]; skipped?: boolean }[] = [];

  for (const userDoc of scheduledUsers) {
    const schedule = userDoc["preferences.scanSchedule"] ?? (userDoc as unknown as { preferences?: { scanSchedule?: { interval: string; enabledTypes: string[]; lastRunAt?: Date } } }).preferences?.scanSchedule;
    if (!schedule || schedule.interval === "disabled") continue;

    const intervalMs = INTERVAL_MS[schedule.interval] ?? 0;
    if (intervalMs === 0) continue;

    const lastRunAt = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
    const isDue = !lastRunAt || now.getTime() - lastRunAt.getTime() >= intervalMs;

    if (!isDue) {
      results.push({ userId: userDoc._id.toString(), types: [], skipped: true });
      continue;
    }

    const enabledTypes = schedule.enabledTypes ?? [];
    const ranTypes: string[] = [];

    for (const scanType of enabledTypes) {
      try {
        if (scanType === "market") {
          const summary = await marketScanService.runScan("manual");
          if (!summary.rateLimited) ranTypes.push("market");
        } else if (scanType === "penny") {
          const { allowed } = await pennyStockScanService.checkDailyLimit();
          if (allowed) {
            await pennyStockScanService.runScan();
            ranTypes.push("penny");
          }
        } else if (scanType === "options") {
          const { allowed } = await optionsScanService.checkDailyLimit();
          if (allowed) {
            await optionsScanService.runOptionsScan({ strategyType: "covered_call", minOpenInterest: 100, maxDTE: 45, minIVPercentile: 0 });
            ranTypes.push("options");
          }
        }
        totalScansTriggered++;
      } catch (err) {
        console.error(`[scheduled-scans] ${scanType} for user ${userDoc._id}:`, err);
      }
    }

    // Update lastRunAt regardless of whether scans ran (to avoid tight retry loops)
    await users.updateOne(
      { _id: userDoc._id },
      { $set: { "preferences.scanSchedule.lastRunAt": now } }
    );

    results.push({ userId: userDoc._id.toString(), types: ranTypes });
  }

  return NextResponse.json({ ok: true, usersChecked: scheduledUsers.length, totalScansTriggered, results });
}

export async function GET() {
  // Returns cost estimates — useful for the settings UI
  return NextResponse.json({
    costEstimates: SCAN_COST_CENTS,
    intervalOptions: [
      { value: "disabled", label: "Disabled" },
      { value: "6h", label: "Every 6 hours" },
      { value: "12h", label: "Every 12 hours" },
      { value: "24h", label: "Daily" },
      { value: "48h", label: "Every 2 days" },
    ],
  });
}
