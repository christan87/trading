import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { simulateStrategies } from "@/lib/services/strategy-simulator";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { symbol, timeframe = "swing", count = 5 } = body;

  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const validTimeframes = ["intraday", "swing", "position"];
  if (!validTimeframes.includes(timeframe)) {
    return NextResponse.json({ error: "invalid timeframe" }, { status: 400 });
  }

  try {
    const result = await simulateStrategies(
      symbol.toUpperCase().trim(),
      timeframe,
      Math.min(Math.max(parseInt(count) || 5, 2), 5)
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("Simulation error:", err);
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
