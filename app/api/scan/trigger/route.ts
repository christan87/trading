import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";
import { newsService } from "@/lib/services/news";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, remaining } = await marketScanService.checkDailyLimit();
  if (!allowed) {
    return NextResponse.json(
      {
        error: `Daily scan limit reached (6/day). Resets at midnight UTC.`,
        scansRemainingToday: 0,
      },
      { status: 429 }
    );
  }

  try {
    // Refresh general market news so the scan has fresh data
    await newsService.ingestGeneralMarketNews().catch(() => null);
    const summary = await marketScanService.runScan("manual");
    return NextResponse.json({ ...summary, scansRemainingToday: remaining - 1 });
  } catch (err) {
    console.error("[api/scan/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
