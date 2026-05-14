import { rateLimiter } from "@/lib/utils/rate-limiter";
import { getCollections } from "@/lib/db/mongodb";
import type { NewsEvent } from "@/lib/db/models";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";
const ALPACA_BASE = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";

interface AlpacaNewsItem {
  id: number;
  headline: string;
  summary: string;
  symbols: string[];
  created_at: string;
  source: string;
}

interface FinnhubNewsItem {
  id: number;
  headline: string;
  summary: string;
  related: string;
  datetime: number;
  source: string;
  sentiment?: { bearishPercent: number; bullishPercent: number };
}

async function fetchAlpacaNews(symbols: string[], token: string): Promise<AlpacaNewsItem[]> {
  await rateLimiter.checkAndIncrement("alpaca_trading");
  const params = new URLSearchParams({
    symbols: symbols.join(","),
    limit: "50",
    sort: "desc",
  });
  const res = await fetch(`${ALPACA_BASE}/v1beta1/news?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.news ?? [];
}

async function fetchFinnhubNews(symbol: string): Promise<FinnhubNewsItem[]> {
  await rateLimiter.checkAndIncrement("finnhub");
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().split("T")[0];
  const res = await fetch(
    `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
  );
  if (!res.ok) return [];
  return res.json();
}

function inferSentiment(
  text: string
): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const positive = ["beat", "surge", "rally", "gain", "profit", "record", "growth", "upgrade", "bullish"];
  const negative = ["miss", "drop", "fall", "loss", "cut", "downgrade", "bearish", "decline", "crash"];
  const pos = positive.filter((w) => lower.includes(w)).length;
  const neg = negative.filter((w) => lower.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function inferCategory(headline: string): NewsEvent["category"] {
  const lower = headline.toLowerCase();
  if (lower.includes("congress") || lower.includes("senate") || lower.includes("house") || lower.includes("legislation")) return "political";
  if (lower.includes("earnings") || lower.includes("eps") || lower.includes("revenue") || lower.includes("guidance")) return "earnings";
  if (lower.includes("fed") || lower.includes("inflation") || lower.includes("rate") || lower.includes("gdp")) return "macro";
  if (lower.includes("fda") || lower.includes("sec") || lower.includes("regulation") || lower.includes("compliance")) return "regulatory";
  if (lower.includes("war") || lower.includes("geopolit") || lower.includes("sanction") || lower.includes("tariff")) return "geopolitical";
  return "sector";
}

export class NewsService {
  async getNewsForSymbols(symbols: string[], token?: string): Promise<NewsEvent[]> {
    const results: NewsEvent[] = [];

    // Alpaca news (primary)
    if (token && symbols.length > 0) {
      try {
        const items = await fetchAlpacaNews(symbols, token);
        for (const item of items) {
          results.push({
            _id: undefined as never,
            sourceApi: "alpaca",
            externalId: String(item.id),
            headline: item.headline,
            summary: item.summary || item.headline,
            tickers: item.symbols,
            category: inferCategory(item.headline),
            sentiment: inferSentiment(item.headline + " " + item.summary),
            publishedAt: new Date(item.created_at),
            ingestedAt: new Date(),
          });
        }
      } catch {
        // Fall through to Finnhub
      }
    }

    // Finnhub news (supplementary or fallback)
    for (const symbol of symbols.slice(0, 5)) {
      try {
        const items = await fetchFinnhubNews(symbol);
        for (const item of items.slice(0, 10)) {
          const sentiment = item.sentiment
            ? item.sentiment.bullishPercent > item.sentiment.bearishPercent
              ? "positive"
              : "negative"
            : inferSentiment(item.headline);

          results.push({
            _id: undefined as never,
            sourceApi: "finnhub",
            externalId: String(item.id),
            headline: item.headline,
            summary: item.summary || item.headline,
            tickers: [symbol],
            category: inferCategory(item.headline),
            sentiment,
            publishedAt: new Date(item.datetime * 1000),
            ingestedAt: new Date(),
          });
        }
      } catch {
        // Skip symbol on error
      }
    }

    return results;
  }

  async ingestAndStore(symbols: string[], token?: string): Promise<number> {
    const items = await this.getNewsForSymbols(symbols, token);
    if (items.length === 0) return 0;

    const { news } = await getCollections();
    let inserted = 0;

    for (const item of items) {
      try {
        await news.updateOne(
          { externalId: item.externalId, sourceApi: item.sourceApi },
          { $setOnInsert: item },
          { upsert: true }
        );
        inserted++;
      } catch {
        // Duplicate — skip
      }
    }

    return inserted;
  }

  async getStoredNewsForSymbol(symbol: string, limitDays = 7): Promise<NewsEvent[]> {
    const { news } = await getCollections();
    const since = new Date(Date.now() - limitDays * 86400_000);
    return news
      .find({ tickers: symbol, publishedAt: { $gte: since } })
      .sort({ publishedAt: -1 })
      .limit(20)
      .toArray();
  }
}

export const newsService = new NewsService();
