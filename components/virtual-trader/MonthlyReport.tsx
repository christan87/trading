"use client";

import { Card } from "@/components/ui/Card";
import type { VirtualTrader } from "@/lib/db/models";

interface Props {
  monthlyReturns: VirtualTrader["monthlyReturns"];
}

function barHeight(val: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(100, Math.abs(val / max) * 80);
}

export function MonthlyReport({ monthlyReturns }: Props) {
  if (monthlyReturns.length === 0) {
    return (
      <Card>
        <p className="text-xs text-zinc-500 text-center py-4">No monthly data yet — evaluations run at end of each month.</p>
      </Card>
    );
  }

  const maxAbs = Math.max(...monthlyReturns.map((m) => Math.abs(m.returnPct)), 1);
  const displayed = monthlyReturns.slice(-6);

  const totalTrades = displayed.reduce((s, m) => s + m.tradesExecuted, 0);
  const avgWinRate = displayed.length > 0
    ? Math.round(displayed.reduce((s, m) => s + m.winRate, 0) / displayed.length * 100) / 100
    : 0;

  return (
    <Card>
      <p className="text-sm font-semibold text-zinc-300 mb-4">Monthly Performance</p>
      <div className="flex items-end gap-2 h-24 mb-3">
        {displayed.map((m) => {
          const h = barHeight(m.returnPct, maxAbs);
          const positive = m.returnPct >= 0;
          return (
            <div key={m.month} className="flex flex-col items-center flex-1 gap-1">
              <div
                className={`w-full rounded-t-sm ${positive ? "bg-emerald-600" : "bg-red-700"}`}
                style={{ height: `${h}%`, minHeight: "2px" }}
                title={`${m.returnPct >= 0 ? "+" : ""}${m.returnPct.toFixed(2)}%`}
              />
              <span className="text-zinc-600 text-[10px]">{m.month.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs text-center border-t border-zinc-800 pt-3">
        <div>
          <p className="text-zinc-500">Months tracked</p>
          <p className="text-white font-medium">{displayed.length}</p>
        </div>
        <div>
          <p className="text-zinc-500">Total trades</p>
          <p className="text-white font-medium">{totalTrades}</p>
        </div>
        <div>
          <p className="text-zinc-500">Avg win rate</p>
          <p className="text-white font-medium">{avgWinRate}%</p>
        </div>
      </div>
    </Card>
  );
}
