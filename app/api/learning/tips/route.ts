import { NextRequest, NextResponse } from "next/server";
import { getTipsForStrategy, TIPS } from "@/lib/data/tips";

export async function GET(req: NextRequest) {
  const strategyType = req.nextUrl.searchParams.get("strategy");
  const tips = strategyType ? getTipsForStrategy(strategyType) : TIPS;
  return NextResponse.json(tips);
}
