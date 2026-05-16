import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pennyStockScanService } from "@/lib/services/penny-stock-scan";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, remaining } = await pennyStockScanService.checkDailyLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily scan limit reached. Resets at midnight UTC.", scansRemainingToday: 0 },
      { status: 429 }
    );
  }

  let body: { minPrice?: number; maxPrice?: number; minVolume?: number; scanId?: string } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const params = {
    minPrice: typeof body.minPrice === "number" ? body.minPrice : undefined,
    maxPrice: typeof body.maxPrice === "number" ? body.maxPrice : undefined,
    minVolume: typeof body.minVolume === "number" ? body.minVolume : undefined,
  };
  const providedScanId = typeof body.scanId === "string" && body.scanId.length > 0 ? body.scanId : undefined;

  try {
    const summary = await pennyStockScanService.runScan(params, providedScanId);
    return NextResponse.json({ ...summary, scansRemainingToday: remaining - 1 });
  } catch (err) {
    console.error("[api/scan/penny/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
