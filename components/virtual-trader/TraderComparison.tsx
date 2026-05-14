"use client";

import { Card } from "@/components/ui/Card";
import type { VirtualTrader } from "@/lib/db/models";

interface Props {
  traders: (VirtualTrader & { strategyName: string })[];
}

function pnlClass(v: number) {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-400";
}

export function TraderComparison({ traders }: Props) {
  if (traders.length < 2) return null;

  const sorted = [...traders].sort((a, b) => b.totalReturnPct - a.totalReturnPct);

  return (
    <Card>
      <p className="text-sm font-semibold text-zinc-300 mb-3">Strategy Comparison</p>
      <div className="space-y-2">
        {sorted.map((t) => {
          const id = (t._id as unknown as { toString(): string }).toString();
          const lastMonth = t.monthlyReturns.at(-1);
          return (
            <div key={id} className="flex items-center justify-between text-xs py-2 border-b border-zinc-800 last:border-0">
              <div>
                <p className="text-zinc-300 font-medium">{t.strategyName}</p>
                <p className="text-zinc-600">${t.currentBalance.toLocaleString()}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className={`font-semibold ${pnlClass(t.totalReturnPct)}`}>
                  {t.totalReturnPct >= 0 ? "+" : ""}{t.totalReturnPct.toFixed(2)}% total
                </p>
                {lastMonth && (
                  <p className={`${pnlClass(lastMonth.returnPct)}`}>
                    {lastMonth.returnPct >= 0 ? "+" : ""}{lastMonth.returnPct.toFixed(2)}% this month
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
