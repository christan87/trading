"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { RoiData, MonthlyPnL } from "@/lib/services/roi-tracker";

function MonthBar({ month }: { month: MonthlyPnL }) {
  const label = month.month.slice(5); // "MM"
  const absRet = Math.abs(month.returnPct);
  const maxHeight = 48; // px
  const height = Math.min(absRet * 3, maxHeight);
  const positive = month.returnPct >= 0;

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span
        className={`text-xs font-medium ${
          positive ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {month.returnPct !== 0
          ? `${positive ? "+" : ""}${month.returnPct.toFixed(1)}%`
          : "—"}
      </span>
      <div
        className={`w-full rounded-sm min-h-[2px] ${
          positive ? "bg-emerald-500" : "bg-red-500"
        }`}
        style={{ height: `${Math.max(height, 2)}px` }}
      />
      <span className="text-xs text-zinc-600">{label}</span>
    </div>
  );
}

export function RoiTarget() {
  const [data, setData] = useState<RoiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/roi")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <div className="h-40 animate-pulse bg-zinc-800 rounded" />
      </Card>
    );
  }

  if (!data) return null;

  const {
    targetMonthlyPct,
    currentMonthReturnPct,
    currentMonthWins,
    currentMonthLosses,
    currentMonthTrades,
    progressTowardTarget,
    projectedMonthEndPct,
    last6Months,
    allTimeReturnPct,
    allTimeTrades,
  } = data;

  const progressColor =
    progressTowardTarget >= 100
      ? "bg-emerald-500"
      : progressTowardTarget >= 60
      ? "bg-yellow-500"
      : "bg-zinc-600";

  const monthName = new Date().toLocaleString("default", { month: "long" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>ROI Target</CardTitle>
      </CardHeader>

      <div className="flex items-start gap-6 mb-4">
        {/* Current month */}
        <div className="flex-1">
          <p className="text-xs text-zinc-500 mb-1">{monthName} return</p>
          <p
            className={`text-2xl font-bold ${
              currentMonthReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {currentMonthReturnPct >= 0 ? "+" : ""}
            {currentMonthReturnPct.toFixed(1)}%
          </p>
          <p className="text-xs text-zinc-600">
            {currentMonthWins}W / {currentMonthLosses}L ({currentMonthTrades} trades)
          </p>
        </div>

        {/* Target */}
        <div className="text-right">
          <p className="text-xs text-zinc-500 mb-1">Monthly target</p>
          <p className="text-2xl font-bold text-zinc-300">+{targetMonthlyPct}%</p>
          {projectedMonthEndPct !== null && (
            <p
              className={`text-xs ${
                projectedMonthEndPct >= targetMonthlyPct
                  ? "text-emerald-500"
                  : "text-zinc-500"
              }`}
            >
              Proj: {projectedMonthEndPct >= 0 ? "+" : ""}
              {projectedMonthEndPct.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-zinc-600 mb-1">
          <span>Progress to target</span>
          <span>{progressTowardTarget.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor}`}
            style={{ width: `${Math.min(progressTowardTarget, 100)}%` }}
          />
        </div>
      </div>

      {/* Monthly chart */}
      {last6Months.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-zinc-600 mb-3">Last 6 months</p>
          <div className="flex items-end gap-2 h-16">
            {last6Months.map((m) => (
              <MonthBar key={m.month} month={m} />
            ))}
          </div>
        </div>
      )}

      {/* All-time */}
      <div className="flex justify-between text-xs pt-3 border-t border-zinc-800">
        <span className="text-zinc-600">All-time return</span>
        <span
          className={`font-medium ${
            allTimeReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {allTimeReturnPct >= 0 ? "+" : ""}
          {allTimeReturnPct.toFixed(1)}% across {allTimeTrades} trades
        </span>
      </div>

      {currentMonthTrades === 0 && (
        <p className="text-xs text-zinc-600 text-center mt-3">
          No resolved trades this month yet.
        </p>
      )}
    </Card>
  );
}
