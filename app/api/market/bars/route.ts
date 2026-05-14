import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketDataService } from "@/lib/services/market-data";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  const timeframe = (req.nextUrl.searchParams.get("timeframe") as "1Min" | "5Min" | "15Min" | "1Hour" | "1Day") ?? "1Day";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10);

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const bars = await marketDataService.getBars(symbol, timeframe, limit);
    return NextResponse.json({ symbol, bars });
  } catch (err) {
    console.error("[api/market/bars]", err);
    return NextResponse.json({ error: "Failed to fetch bars" }, { status: 500 });
  }
}
