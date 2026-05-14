"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface OptionsContract {
  symbol: string;
  strike_price: number;
  expiration_date: string;
  type: "call" | "put";
  open_interest: number;
  volume: number;
  ask: number;
  implied_volatility: number | null;
  delta: number | null;
  theta: number | null;
}

interface OptionsChainProps {
  symbol: string;
}

export function OptionsChain({ symbol }: OptionsChainProps) {
  const [contracts, setContracts] = useState<OptionsContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExp, setSelectedExp] = useState<string>("");
  const [side, setSide] = useState<"call" | "put">("call");

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/market/options-chain?symbol=${symbol}`)
      .then((r) => r.json())
      .then((d) => {
        const all: OptionsContract[] = d.contracts ?? [];
        setContracts(all);
        if (all.length > 0 && !selectedExp) {
          const exps = [...new Set(all.map((c) => c.expiration_date))].sort();
          setSelectedExp(exps[0] ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  const expirations = [...new Set(contracts.map((c) => c.expiration_date))].sort();
  const filtered = contracts.filter(
    (c) => c.type === side && (selectedExp ? c.expiration_date === selectedExp : true)
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{symbol} Options Chain</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
              <button
                onClick={() => setSide("call")}
                className={`px-3 py-1 ${side === "call" ? "bg-emerald-800 text-emerald-200" : "text-zinc-400"}`}
              >
                Calls
              </button>
              <button
                onClick={() => setSide("put")}
                className={`px-3 py-1 ${side === "put" ? "bg-red-800 text-red-200" : "text-zinc-400"}`}
              >
                Puts
              </button>
            </div>
            <select
              value={selectedExp}
              onChange={(e) => setSelectedExp(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 rounded px-2 py-1"
            >
              {expirations.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      {loading ? (
        <div className="space-y-1 animate-pulse">
          {[1,2,3,4].map((i) => <div key={i} className="h-8 bg-zinc-800 rounded" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No options data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2 pr-3">Strike</th>
                <th className="text-right pb-2 pr-3">Ask</th>
                <th className="text-right pb-2 pr-3">IV</th>
                <th className="text-right pb-2 pr-3">Delta</th>
                <th className="text-right pb-2 pr-3">Theta</th>
                <th className="text-right pb-2 pr-3">OI</th>
                <th className="text-right pb-2">Vol</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 20).map((c) => (
                <tr key={c.symbol} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                  <td className="py-1.5 pr-3 font-medium text-white">${c.strike_price.toFixed(0)}</td>
                  <td className="text-right pr-3 text-zinc-300">${c.ask.toFixed(2)}</td>
                  <td className="text-right pr-3 text-zinc-300">
                    {c.implied_volatility !== null ? `${(c.implied_volatility * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="text-right pr-3 text-zinc-300">
                    {c.delta !== null ? c.delta.toFixed(2) : "—"}
                  </td>
                  <td className="text-right pr-3 text-zinc-300">
                    {c.theta !== null ? c.theta.toFixed(3) : "—"}
                  </td>
                  <td className="text-right pr-3 text-zinc-300">{c.open_interest.toLocaleString()}</td>
                  <td className="text-right text-zinc-300">{c.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
