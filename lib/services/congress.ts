import { rateLimiter } from "@/lib/utils/rate-limiter";
import { getCollections } from "@/lib/db/mongodb";
import type { CongressTrade } from "@/lib/db/models";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";

interface FinnhubCongressTrade {
  name: string;
  symbol: string;
  transaction: string;
  amount: string;
  filingDate: string;
  transactionDate: string;
  chamber?: string;
  party?: string;
  state?: string;
}

export class CongressService {
  async fetchAndStore(symbol?: string): Promise<number> {
    await rateLimiter.checkAndIncrement("finnhub");

    const url = symbol
      ? `https://finnhub.io/api/v1/stock/congressional-trading?symbol=${symbol}&token=${FINNHUB_KEY}`
      : `https://finnhub.io/api/v1/stock/congressional-trading?token=${FINNHUB_KEY}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub congress API ${res.status}`);

    const data: { data: FinnhubCongressTrade[] } = await res.json();
    const items = data.data ?? [];
    if (items.length === 0) return 0;

    const { congressTrades } = await getCollections();
    let inserted = 0;

    for (const item of items) {
      const tradeDate = new Date(item.transactionDate);
      const filingDate = new Date(item.filingDate);
      const reportingGapDays = Math.floor(
        (filingDate.getTime() - tradeDate.getTime()) / 86400_000
      );

      const doc: Omit<CongressTrade, "_id"> = {
        memberName: item.name,
        chamber: item.chamber?.toLowerCase().includes("senate") ? "senate" : "house",
        party: (item.party?.charAt(0).toUpperCase() as "D" | "R" | "I") ?? "I",
        state: item.state ?? "",
        symbol: item.symbol,
        transactionType: item.transaction?.toLowerCase().includes("purchase") ? "purchase" : "sale",
        amountRange: item.amount,
        tradeDate,
        filingDate,
        reportingGapDays,
        sourceApi: "finnhub",
        ingestedAt: new Date(),
      };

      try {
        await congressTrades.updateOne(
          {
            memberName: doc.memberName,
            symbol: doc.symbol,
            tradeDate: doc.tradeDate,
            transactionType: doc.transactionType,
          },
          { $setOnInsert: doc },
          { upsert: true }
        );
        inserted++;
      } catch {
        // Duplicate — skip
      }
    }

    return inserted;
  }

  async getTradesForSymbol(symbol: string, limitDays = 180): Promise<CongressTrade[]> {
    const { congressTrades } = await getCollections();
    const since = new Date(Date.now() - limitDays * 86400_000);
    return congressTrades
      .find({ symbol, tradeDate: { $gte: since } })
      .sort({ tradeDate: -1 })
      .limit(50)
      .toArray();
  }

  async getClusterSignal(
    symbol: string
  ): Promise<{ signal: "bullish" | "bearish" | "neutral"; purchases: number; sales: number }> {
    const trades = await this.getTradesForSymbol(symbol, 90);
    const purchases = trades.filter((t) => t.transactionType === "purchase").length;
    const sales = trades.filter((t) => t.transactionType === "sale").length;

    if (purchases >= 3 && purchases > sales * 2) return { signal: "bullish", purchases, sales };
    if (sales >= 3 && sales > purchases * 2) return { signal: "bearish", purchases, sales };
    return { signal: "neutral", purchases, sales };
  }

  async getSectorClusterSignals(
    symbols: string[],
    windowDays = 30
  ): Promise<Map<string, { purchases: number; sales: number; members: string[] }>> {
    const { congressTrades } = await getCollections();
    const since = new Date(Date.now() - windowDays * 86400_000);
    const trades = await congressTrades
      .find({ symbol: { $in: symbols }, tradeDate: { $gte: since } })
      .toArray();

    const bySymbol = new Map<string, { purchases: number; sales: number; members: Set<string> }>();

    for (const trade of trades) {
      if (!bySymbol.has(trade.symbol)) {
        bySymbol.set(trade.symbol, { purchases: 0, sales: 0, members: new Set() });
      }
      const entry = bySymbol.get(trade.symbol)!;
      if (trade.transactionType === "purchase") entry.purchases++;
      else entry.sales++;
      entry.members.add(trade.memberName);
    }

    const result = new Map<string, { purchases: number; sales: number; members: string[] }>();
    for (const [symbol, data] of bySymbol) {
      result.set(symbol, {
        purchases: data.purchases,
        sales: data.sales,
        members: [...data.members],
      });
    }
    return result;
  }
}

export const congressService = new CongressService();
