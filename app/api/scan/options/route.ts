import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { optionsScanService } from "@/lib/services/options-scan";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [results, recentRuns, { remaining }] = await Promise.all([
      optionsScanService.getLatestResults(30),
      optionsScanService.getRecentRunIds(5),
      optionsScanService.checkDailyLimit(),
    ]);
    return NextResponse.json({ results, recentRuns, scansRemainingToday: remaining });
  } catch (err) {
    console.error("[api/scan/options GET]", err);
    return NextResponse.json({ error: "Failed to fetch options scan results" }, { status: 500 });
  }
}
