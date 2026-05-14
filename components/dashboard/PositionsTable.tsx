"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface Position {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
  asset_class: string;
  change_today: string;
}

function pct(val: string): string {
  return `${(parseFloat(val) * 100).toFixed(2)}%`;
}

function usd(val: string): string {
  const n = parseFloat(val);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PositionsTable() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/alpaca/positions");
        if (res.status === 401) { setNotConnected(true); setLoading(false); return; }
        if (!res.ok) { setError(true); setLoading(false); return; }
        setPositions(await res.json());
        setNotConnected(false);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Positions</CardTitle>
      </CardHeader>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-zinc-800 rounded" />)}
        </div>
      ) : notConnected ? (
        <p className="text-sm text-zinc-500">
          Connect your Alpaca account in{" "}
          <a href="/settings" className="text-yellow-400 hover:underline">Settings</a>{" "}
          to see positions.
        </p>
      ) : error ? (
        <p className="text-sm text-zinc-500">
          Could not load positions.{" "}
          <a href="/settings" className="text-yellow-400 hover:underline">
            Check your Alpaca connection.
          </a>
        </p>
      ) : positions.length === 0 ? (
        <p className="text-sm text-zinc-500">No open positions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                <th className="text-left pb-2 pr-4">Symbol</th>
                <th className="text-right pb-2 pr-4">Qty</th>
                <th className="text-right pb-2 pr-4">Avg Cost</th>
                <th className="text-right pb-2 pr-4">Price</th>
                <th className="text-right pb-2 pr-4">Mkt Value</th>
                <th className="text-right pb-2 pr-4">P&L</th>
                <th className="text-right pb-2">Today</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pl = parseFloat(p.unrealized_pl);
                const plColor = pl >= 0 ? "text-emerald-400" : "text-red-400";
                const todayChange = parseFloat(p.change_today);
                const todayColor = todayChange >= 0 ? "text-emerald-400" : "text-red-400";
                return (
                  <tr key={p.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2.5 pr-4 font-medium text-white">
                      {p.symbol}
                      <span className="ml-1 text-xs text-zinc-500">{p.side}</span>
                    </td>
                    <td className="text-right pr-4 text-zinc-300">{p.qty}</td>
                    <td className="text-right pr-4 text-zinc-300">{usd(p.avg_entry_price)}</td>
                    <td className="text-right pr-4 text-zinc-300">{usd(p.current_price)}</td>
                    <td className="text-right pr-4 text-zinc-300">{usd(p.market_value)}</td>
                    <td className={`text-right pr-4 font-medium ${plColor}`}>
                      {usd(p.unrealized_pl)}
                      <span className="ml-1 text-xs">({pct(p.unrealized_plpc)})</span>
                    </td>
                    <td className={`text-right font-medium ${todayColor}`}>
                      {usd(p.change_today)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
