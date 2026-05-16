import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";
import { newsService } from "@/lib/services/news";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, remaining } = await marketScanService.checkDailyLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: `Daily scan limit reached (6/day). Resets at midnight UTC.`, scansRemainingToday: 0 },
      { status: 429 }
    );
  }

  let providedScanId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.scanId === "string" && body.scanId.length > 0) {
      providedScanId = body.scanId;
    }
  } catch { /* body is optional */ }

  try {
    await newsService.ingestGeneralMarketNews().catch(() => null);
    const summary = await marketScanService.runScan("manual", providedScanId);
    return NextResponse.json({ ...summary, scansRemainingToday: remaining - 1 });
  } catch (err) {
    console.error("[api/scan/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
