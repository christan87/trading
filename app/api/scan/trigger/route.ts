import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";
import { newsService } from "@/lib/services/news";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Refresh general market news before scanning so the scan has fresh data
    await newsService.ingestGeneralMarketNews().catch(() => null);
    const summary = await marketScanService.runScan();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[api/scan/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
