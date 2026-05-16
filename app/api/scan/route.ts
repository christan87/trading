import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?scanId= used by the streaming fallback poller to check in-progress scan results
  const scanId = req.nextUrl.searchParams.get("scanId");
  if (scanId) {
    try {
      const results = await marketScanService.getResultsByScanId(scanId);
      return NextResponse.json({ results });
    } catch (err) {
      console.error("[api/scan GET ?scanId]", err);
      return NextResponse.json({ error: "Failed to fetch scan results" }, { status: 500 });
    }
  }

  try {
    const [results, recentRuns, { remaining }] = await Promise.all([
      marketScanService.getLatestResults(30),
      marketScanService.getRecentRunIds(5),
      marketScanService.checkDailyLimit(),
    ]);
    return NextResponse.json({ results, recentRuns, scansRemainingToday: remaining });
  } catch (err) {
    console.error("[api/scan GET]", err);
    return NextResponse.json({ error: "Failed to fetch scan results" }, { status: 500 });
  }
}
