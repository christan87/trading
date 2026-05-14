import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [results, recentRuns] = await Promise.all([
      marketScanService.getLatestResults(30),
      marketScanService.getRecentRunIds(5),
    ]);
    return NextResponse.json({ results, recentRuns });
  } catch (err) {
    console.error("[api/scan GET]", err);
    return NextResponse.json({ error: "Failed to fetch scan results" }, { status: 500 });
  }
}
