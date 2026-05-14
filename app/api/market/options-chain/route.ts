import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketDataService } from "@/lib/services/market-data";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  const expiration = req.nextUrl.searchParams.get("expiration") ?? undefined;

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const { contracts, planLimited } = await marketDataService.getOptionsChain(symbol, expiration);
    return NextResponse.json({
      symbol,
      contracts,
      ...(planLimited && {
        note: "Options data requires Alpaca Algo Trader Plus. Upgrade at app.alpaca.markets.",
      }),
    });
  } catch (err) {
    console.error("[api/market/options-chain]", err);
    return NextResponse.json({ error: "Failed to fetch options chain" }, { status: 500 });
  }
}
