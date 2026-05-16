import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { optionsScanService, type OptionsScanParams } from "@/lib/services/options-scan";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, remaining } = await optionsScanService.checkDailyLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: "Options scan daily limit reached. Resets at midnight UTC.", scansRemainingToday: 0 },
      { status: 429 }
    );
  }

  let raw: Partial<OptionsScanParams> & { scanId?: string } = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }

  const body: OptionsScanParams = {
    strategyType: raw.strategyType ?? "covered_call",
    minOpenInterest: raw.minOpenInterest ?? 100,
    maxDTE: raw.maxDTE ?? 45,
    minIVPercentile: raw.minIVPercentile ?? 0,
    tickers: raw.tickers,
  };
  const providedScanId = typeof raw.scanId === "string" && raw.scanId.length > 0 ? raw.scanId : undefined;

  try {
    const summary = await optionsScanService.runOptionsScan(body, providedScanId);
    return NextResponse.json({ ...summary, scansRemainingToday: remaining - 1 });
  } catch (err) {
    console.error("[api/scan/options/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
