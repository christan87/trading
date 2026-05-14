"use client";

import { Card } from "@/components/ui/Card";
import type { VirtualTrader } from "@/lib/db/models";

interface Props {
  trader: VirtualTrader & { strategyName: string };
  onToggleActive: (id: string, isActive: boolean) => void;
  onSelect: (id: string) => void;
  selected: boolean;
}

function pnlClass(v: number) {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-400";
}

export function VirtualTraderCard({ trader, onToggleActive, onSelect, selected }: Props) {
  const id = (trader._id as unknown as { toString(): string }).toString();
  const lastMonth = trader.monthlyReturns.at(-1);

  return (
    <Card
      className={`cursor-pointer transition-colors ${selected ? "border-yellow-500" : "hover:border-zinc-600"}`}
    >
      <button className="w-full text-left" onClick={() => onSelect(id)}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">{trader.strategyName}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Virtual Trader</p>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              trader.config.isActive
                ? "border-emerald-700 text-emerald-400 bg-emerald-950"
                : "border-zinc-700 text-zinc-500 bg-zinc-800"
            }`}
          >
            {trader.config.isActive ? "Active" : "Paused"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-zinc-500">Balance</p>
            <p className="text-white font-medium">${trader.currentBalance.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-zinc-500">Total Return</p>
            <p className={pnlClass(trader.totalReturnPct)}>
              {trader.totalReturnPct >= 0 ? "+" : ""}{trader.totalReturnPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-zinc-500">This Month</p>
            <p className={pnlClass(lastMonth?.returnPct ?? 0)}>
              {lastMonth ? `${lastMonth.returnPct >= 0 ? "+" : ""}${lastMonth.returnPct.toFixed(2)}%` : "—"}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-500">
          <span>Target: {trader.config.targetRoiPct}%/mo</span>
          <span>Max pos: {trader.config.maxPositionSizePct}%</span>
        </div>
      </button>

      <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(id, !trader.config.isActive); }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {trader.config.isActive ? "Pause" : "Resume"}
        </button>
      </div>
    </Card>
  );
}
