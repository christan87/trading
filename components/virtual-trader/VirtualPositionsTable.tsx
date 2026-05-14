"use client";

import type { VirtualPosition } from "@/lib/db/models";

interface Props {
  positions: VirtualPosition[];
  tab: "open" | "closed";
  onTabChange: (tab: "open" | "closed") => void;
}

function pnlClass(v: number) {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-400";
}

export function VirtualPositionsTable({ positions, tab, onTabChange }: Props) {
  const displayed = positions.filter((p) => p.status === tab);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
              tab === t
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">
          No {tab} positions.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2 font-medium">Symbol</th>
                <th className="text-left pb-2 font-medium">Side</th>
                <th className="text-right pb-2 font-medium">Entry</th>
                <th className="text-right pb-2 font-medium">{tab === "open" ? "Current" : "Exit"}</th>
                <th className="text-right pb-2 font-medium">P&L %</th>
                {tab === "closed" && <th className="text-left pb-2 font-medium pl-4">Reason</th>}
              </tr>
            </thead>
            <tbody>
              {displayed.map((pos) => {
                const id = (pos._id as unknown as { toString(): string }).toString();
                const pnl = tab === "open" ? pos.unrealizedPnlPct : (pos.realizedPnlPct ?? 0);
                const price = tab === "open" ? pos.currentPrice : (pos.exitPrice ?? pos.currentPrice);
                return (
                  <tr key={id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 font-medium text-white">{pos.symbol}</td>
                    <td className="py-2 capitalize text-zinc-400">{pos.side}</td>
                    <td className="py-2 text-right text-zinc-300">${pos.entryPrice.toFixed(2)}</td>
                    <td className="py-2 text-right text-zinc-300">${price.toFixed(2)}</td>
                    <td className={`py-2 text-right font-medium ${pnlClass(pnl)}`}>
                      {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                    </td>
                    {tab === "closed" && (
                      <td className="py-2 pl-4 text-zinc-500">
                        {pos.exitReason?.replace(/_/g, " ")}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
