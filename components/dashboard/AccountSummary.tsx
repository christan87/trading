"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface AccountData {
  equity: string;
  cash: string;
  buying_power: string;
  long_market_value: string;
  unrealized_pl?: string;
  portfolio_value: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function fmt(val: string | undefined): string {
  const n = parseFloat(val ?? "0");
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function AccountSummary() {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/alpaca/account");
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        setError(true);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <Card>
        <p className="text-sm text-red-400">Failed to load account. Check your Alpaca connection in Settings.</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-zinc-800 rounded w-32" />
          ))}
        </div>
      </Card>
    );
  }

  const equity = parseFloat(data.equity);
  const portfolioValue = parseFloat(data.portfolio_value);
  const pnl = equity - portfolioValue;
  const pnlColor = pnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Account Summary</CardTitle>
          {data.trading_blocked && (
            <span className="text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded">
              Trading Blocked
            </span>
          )}
          {data.pattern_day_trader && (
            <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded">
              PDT
            </span>
          )}
        </div>
      </CardHeader>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Equity" value={fmt(data.equity)} />
        <Stat label="Cash" value={fmt(data.cash)} />
        <Stat label="Buying Power" value={fmt(data.buying_power)} />
        <Stat
          label="Long Value"
          value={fmt(data.long_market_value)}
          sub={`Day trades: ${data.daytrade_count}/3`}
        />
      </div>
      {data.unrealized_pl && (
        <p className={`mt-3 text-sm font-medium ${pnlColor}`}>
          Unrealized P&L: {fmt(data.unrealized_pl)}
        </p>
      )}
    </Card>
  );
}
