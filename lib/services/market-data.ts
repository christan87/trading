import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";
import { rateLimiter } from "@/lib/utils/rate-limiter";

const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL ?? "https://data.alpaca.markets";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";

export interface Quote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: number;
  source: "alpaca" | "finnhub";
}

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionsContract {
  symbol: string;
  strike_price: number;
  expiration_date: string;
  type: "call" | "put";
  open_interest: number;
  volume: number;
  bid: number;
  ask: number;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

async function alpacaDataFetch<T>(path: string, token?: string): Promise<T> {
  await rateLimiter.checkAndIncrement("alpaca_data");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (process.env.ALPACA_API_KEY) {
    // Static API key auth — requires ALPACA_API_KEY + ALPACA_API_SECRET in .env.local
    headers["APCA-API-KEY-ID"] = process.env.ALPACA_API_KEY;
    headers["APCA-API-SECRET-KEY"] = process.env.ALPACA_API_SECRET ?? "";
  }
  // If neither token nor API key is set, the request will 401 — handled by callers

  const res = await fetch(`${ALPACA_DATA_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca data ${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function finnhubFetch<T>(path: string): Promise<T> {
  await rateLimiter.checkAndIncrement("finnhub");
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://finnhub.io/api/v1${path}${separator}token=${FINNHUB_KEY}`);
  if (!res.ok) throw new Error(`Finnhub ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export class MarketDataService {
  async getQuote(symbol: string): Promise<Quote> {
    const cached = await this.getCachedQuote(symbol);
    if (cached) return cached;

    try {
      return await this.getAlpacaQuote(symbol);
    } catch {
      return await this.getFinnhubQuote(symbol);
    }
  }

  private async getCachedQuote(symbol: string): Promise<Quote | null> {
    const redis = getRedis();
    const raw = await redis.get<Quote>(REDIS_KEYS.quote(symbol));
    if (!raw) return null;
    // Stale if older than 15 seconds
    if (Date.now() - raw.timestamp > 15_000) return null;
    return raw;
  }

  private async getAlpacaQuote(symbol: string): Promise<Quote> {
    const data = await alpacaDataFetch<{
      trade: { p: number; s: number; t: string };
    }>(`/v2/stocks/${symbol}/trades/latest?feed=iex`);

    const price = data.trade?.p;
    if (!price) {
      throw new Error(`No price data for ${symbol} — verify the ticker symbol is correct`);
    }

    const quote: Quote = {
      symbol,
      price,
      open: 0,
      high: 0,
      low: 0,
      previousClose: 0,
      change: 0,
      changePct: 0,
      volume: data.trade.s,
      timestamp: Date.now(),
      source: "alpaca",
    };

    await this.cacheQuote(symbol, quote);
    return quote;
  }

  private async getFinnhubQuote(symbol: string): Promise<Quote> {
    const data = await finnhubFetch<{
      c: number; h: number; l: number; o: number; pc: number; v: number; t: number;
    }>(`/quote?symbol=${symbol}`);

    if (!data.c) {
      throw new Error(`No price data for ${symbol} — verify the ticker symbol is correct`);
    }

    const quote: Quote = {
      symbol,
      price: data.c,
      open: data.o,
      high: data.h,
      low: data.l,
      previousClose: data.pc,
      change: data.c - data.pc,
      changePct: ((data.c - data.pc) / data.pc) * 100,
      volume: data.v,
      timestamp: Date.now(),
      source: "finnhub",
    };

    await this.cacheQuote(symbol, quote);
    return quote;
  }

  private async cacheQuote(symbol: string, quote: Quote): Promise<void> {
    const redis = getRedis();
    await redis.set(REDIS_KEYS.quote(symbol), quote, { ex: 30 });
  }

  async getBars(
    symbol: string,
    timeframe: "1Min" | "5Min" | "15Min" | "1Hour" | "1Day" = "1Day",
    limit = 30
  ): Promise<Bar[]> {
    const data = await alpacaDataFetch<{ bars: Record<string, { t: string; o: number; h: number; l: number; c: number; v: number }[]> }>(
      `/v2/stocks/bars?symbols=${symbol}&timeframe=${timeframe}&limit=${limit}&feed=iex`
    );

    const bars = data.bars[symbol] ?? [];
    return bars.map((b) => ({
      timestamp: b.t,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  }

  async getOptionsChain(
    symbol: string,
    _expiration?: string
  ): Promise<{ contracts: OptionsContract[]; planLimited: boolean }> {
    // Try Alpaca snapshot first (requires Algo Trader Plus plan)
    try {
      const data = await alpacaDataFetch<{
        option_contracts: {
          symbol: string;
          strike_price: string;
          expiration_date: string;
          type: "call" | "put";
          open_interest: number;
          volume: number;
          close_price: string | null;
          greeks: { delta: number | null; gamma: number | null; theta: number | null; vega: number | null } | null;
          implied_volatility: string | null;
        }[];
      }>(`/v2/options/snapshots/${symbol}?feed=indicative`);

      const contracts = (data.option_contracts ?? []).map((c) => ({
        symbol: c.symbol,
        strike_price: parseFloat(c.strike_price),
        expiration_date: c.expiration_date,
        type: c.type,
        open_interest: c.open_interest,
        volume: c.volume,
        bid: 0,
        ask: parseFloat(c.close_price ?? "0"),
        implied_volatility: c.implied_volatility ? parseFloat(c.implied_volatility) : null,
        delta: c.greeks?.delta ?? null,
        gamma: c.greeks?.gamma ?? null,
        theta: c.greeks?.theta ?? null,
        vega: c.greeks?.vega ?? null,
      }));
      return { contracts, planLimited: false };
    } catch {
      // Alpaca Basic plan returns 403/404 — fall back to Finnhub option chain
    }

    // Finnhub fallback — free tier includes option chain with IV, bid, ask, OI
    try {
      const finnhubContracts = await this.getOptionsFinnhub(symbol);
      return { contracts: finnhubContracts, planLimited: false };
    } catch {
      return { contracts: [], planLimited: true };
    }
  }

  private async getOptionsFinnhub(symbol: string): Promise<OptionsContract[]> {
    type FinnhubOptionItem = {
      contractName: string;
      strike: number;
      lastPrice: number;
      bid: number;
      ask: number;
      volume: number;
      openInterest: number;
      impliedVolatility: number;
    };
    type FinnhubOptionChain = {
      data: {
        expirationDate: string;
        options: { CALL?: FinnhubOptionItem[]; PUT?: FinnhubOptionItem[] };
      }[];
    };

    const data = await finnhubFetch<FinnhubOptionChain>(
      `/stock/option-chain?symbol=${symbol}`
    );

    const results: OptionsContract[] = [];
    const today = Date.now();

    for (const exp of data.data ?? []) {
      const expMs = new Date(exp.expirationDate).getTime();
      if (expMs <= today) continue;

      const mapItems = (items: FinnhubOptionItem[] | undefined, type: "call" | "put") => {
        for (const c of items ?? []) {
          results.push({
            symbol: c.contractName,
            strike_price: c.strike,
            expiration_date: exp.expirationDate,
            type,
            open_interest: c.openInterest ?? 0,
            volume: c.volume ?? 0,
            bid: c.bid ?? 0,
            ask: c.ask ?? c.lastPrice ?? 0,
            implied_volatility: c.impliedVolatility ?? null,
            delta: null,
            gamma: null,
            theta: null,
            vega: null,
          });
        }
      };

      mapItems(exp.options.CALL, "call");
      mapItems(exp.options.PUT, "put");
    }

    return results;
  }

  // Kept for backward compatibility — callers should prefer getOptionsChain
  async getOptionsContracts(
    symbol: string,
    _opts: { type?: "call" | "put"; expirationBefore?: string; limit?: number } = {}
  ): Promise<OptionsContract[]> {
    const { contracts } = await this.getOptionsChain(symbol);
    return contracts;
  }

  async getCompanyProfile(symbol: string): Promise<{
    name: string;
    industry: string;
    marketCap: number;
    description: string;
  }> {
    const data = await finnhubFetch<{
      name: string;
      finnhubIndustry: string;
      marketCapitalization: number;
      description: string;
    }>(`/stock/profile2?symbol=${symbol}`);

    return {
      name: data.name ?? symbol,
      industry: data.finnhubIndustry ?? "",
      marketCap: data.marketCapitalization ?? 0,
      description: data.description ?? "",
    };
  }
}

export const marketDataService = new MarketDataService();
