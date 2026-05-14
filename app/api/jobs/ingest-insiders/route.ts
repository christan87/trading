import { NextRequest, NextResponse } from "next/server";
import { congressService } from "@/lib/services/congress";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sp500: { symbol: string }[] = require("@/data/sp500.json");

// Weekly job — iterates S&P 500 and fetches insider purchase transactions from Finnhub
// Run at a rate that respects Finnhub's 60 req/min limit (the rate-limiter handles this)
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let totalInserted = 0;
  let processed = 0;
  const errors: string[] = [];

  for (const { symbol } of sp500) {
    try {
      const inserted = await congressService.fetchAndStoreInsiderTrades(symbol);
      totalInserted += inserted;
      processed++;
    } catch (err) {
      errors.push(`${symbol}: ${String(err).slice(0, 80)}`);
    }
  }

  return NextResponse.json({ processed, totalInserted, errors: errors.slice(0, 20) });
}
