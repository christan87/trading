import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pennyStockScanService } from "@/lib/services/penny-stock-scan";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [results, recentRuns, { remaining }] = await Promise.all([
      pennyStockScanService.getLatestResults(30),
      pennyStockScanService.getRecentRunIds(5),
      pennyStockScanService.checkDailyLimit(),
    ]);
    return NextResponse.json({ results, recentRuns, scansRemainingToday: remaining });
  } catch (err) {
    console.error("[api/scan/penny GET]", err);
    return NextResponse.json({ error: "Failed to fetch penny stock scan results" }, { status: 500 });
  }
}
