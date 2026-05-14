import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pennyStockScanService } from "@/lib/services/penny-stock-scan";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, remaining } = await pennyStockScanService.checkDailyLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily scan limit reached. Resets at midnight UTC.", scansRemainingToday: 0 },
      { status: 429 }
    );
  }

  try {
    const summary = await pennyStockScanService.runScan();
    return NextResponse.json({ ...summary, scansRemainingToday: remaining - 1 });
  } catch (err) {
    console.error("[api/scan/penny/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
