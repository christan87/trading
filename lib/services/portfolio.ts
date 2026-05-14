import { rateLimiter } from "@/lib/utils/rate-limiter";
import { decrypt } from "@/lib/utils/encryption";
import { getCollections } from "@/lib/db/mongodb";

const BASE_URL = process.env.ALPACA_PAPER === "true"
  ? "https://paper-api.alpaca.markets"
  : "https://api.alpaca.markets";

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  buying_power: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  daytrade_count: number;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  qty_available: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  avg_entry_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  status: string;
  created_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
}

export interface PlaceOrderParams {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force?: "day" | "gtc" | "ioc" | "fok";
  limit_price?: number;
  stop_price?: number;
}

async function alpacaFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  await rateLimiter.checkAndIncrement("alpaca_trading");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca API ${path} ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function getTokenForUser(userId: string): Promise<string> {
  const { users } = await getCollections();
  const { ObjectId } = await import("mongodb");
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user?.alpacaOAuthToken) throw new Error("No Alpaca token for user");
  return decrypt(user.alpacaOAuthToken);
}

export class PortfolioService {
  constructor(private readonly token: string) {}

  static async forUser(userId: string): Promise<PortfolioService> {
    const token = await getTokenForUser(userId);
    return new PortfolioService(token);
  }

  async getAccount(): Promise<AlpacaAccount> {
    return alpacaFetch<AlpacaAccount>(this.token, "/v2/account");
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    return alpacaFetch<AlpacaPosition[]>(this.token, "/v2/positions");
  }

  async getPosition(symbol: string): Promise<AlpacaPosition> {
    return alpacaFetch<AlpacaPosition>(this.token, `/v2/positions/${symbol}`);
  }

  async getOrders(status: "open" | "closed" | "all" = "open"): Promise<AlpacaOrder[]> {
    return alpacaFetch<AlpacaOrder[]>(this.token, `/v2/orders?status=${status}&limit=100`);
  }

  async placeOrder(params: PlaceOrderParams): Promise<AlpacaOrder> {
    return alpacaFetch<AlpacaOrder>(this.token, "/v2/orders", {
      method: "POST",
      body: JSON.stringify({
        symbol: params.symbol,
        qty: params.qty,
        side: params.side,
        type: params.type,
        time_in_force: params.time_in_force ?? "day",
        limit_price: params.limit_price?.toString(),
        stop_price: params.stop_price?.toString(),
      }),
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await alpacaFetch(this.token, `/v2/orders/${orderId}`, { method: "DELETE" });
  }

  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return alpacaFetch<AlpacaOrder>(this.token, `/v2/positions/${symbol}`, {
      method: "DELETE",
    });
  }
}
