import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { optionsScanService, type OptionsScanParams } from "@/lib/services/options-scan";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, remaining } = await optionsScanService.checkDailyLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: "Options scan limit reached (3/day). Resets at midnight UTC.", scansRemainingToday: 0 },
      { status: 429 }
    );
  }

  let params: Partial<OptionsScanParams>;
  try {
    params = await req.json();
  } catch {
    params = {};
  }

  const body: OptionsScanParams = {
    strategyType: params.strategyType ?? "covered_call",
    minOpenInterest: params.minOpenInterest ?? 100,
    maxDTE: params.maxDTE ?? 45,
    minIVPercentile: params.minIVPercentile ?? 0,
    tickers: params.tickers,
  };

  try {
    const summary = await optionsScanService.runOptionsScan(body);
    return NextResponse.json({ ...summary, scansRemainingToday: remaining - 1 });
  } catch (err) {
    console.error("[api/scan/options/trigger]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
