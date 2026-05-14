"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { PerformanceSummary, StrategyStats } from "@/lib/services/performance-tracker";

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-medium ${highlight ? "text-yellow-400" : "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

function StrategyRow({ stats }: { stats: StrategyStats }) {
  const winRatePct = (stats.winRate * 100).toFixed(0);
  const color =
    stats.winRate >= 0.6
      ? "text-emerald-400"
      : stats.winRate >= 0.45
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="grid grid-cols-5 gap-2 py-2 border-b border-zinc-800 last:border-0 text-xs">
      <span className="text-zinc-300 font-medium col-span-2 truncate">
        {stats.strategyType.replace(/_/g, " ")}
      </span>
      <span className={`text-center font-semibold ${color}`}>{winRatePct}%</span>
      <span className="text-center text-zinc-400">{stats.resolved}</span>
      <span
        className={`text-center font-medium ${
          stats.avgReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {stats.avgReturnPct >= 0 ? "+" : ""}
        {stats.avgReturnPct.toFixed(1)}%
      </span>
    </div>
  );
}

export function PerformanceStats() {
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/strategies")
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
        <div className="h-24 animate-pulse bg-zinc-800 rounded" />
      </Card>
    );
  }

  if (!data) return null;

  const { overall, byStrategy, recentPerformance, topPerformingStrategy } = data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Strategy Performance</CardTitle>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </CardHeader>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          {
            label: "Win Rate",
            value: `${(overall.winRate * 100).toFixed(0)}%`,
            color:
              overall.winRate >= 0.6
                ? "text-emerald-400"
                : overall.winRate >= 0.45
                ? "text-yellow-400"
                : "text-red-400",
          },
          {
            label: "Avg Return",
            value: `${overall.avgReturnPct >= 0 ? "+" : ""}${overall.avgReturnPct.toFixed(1)}%`,
            color: overall.avgReturnPct >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Total Trades",
            value: String(overall.resolved),
            color: "text-zinc-200",
          },
          {
            label: "Sharpe",
            value:
              overall.sharpeRatio != null
                ? overall.sharpeRatio.toFixed(2)
                : "—",
            color: "text-zinc-200",
          },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className={`text-lg font-semibold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {topPerformingStrategy && (
        <p className="text-xs text-zinc-500 mb-3">
          Best strategy:{" "}
          <span className="text-yellow-400 font-medium">
            {topPerformingStrategy.replace(/_/g, " ")}
          </span>
        </p>
      )}

      {expanded && (
        <>
          {/* Recent performance */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[
              { label: "Last 30 days", data: recentPerformance.last30Days },
              { label: "Last 90 days", data: recentPerformance.last90Days },
            ].map(({ label, data: pd }) => (
              <div key={label} className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-2">{label}</p>
                <p
                  className={`text-base font-semibold ${
                    pd.returnPct >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {pd.returnPct >= 0 ? "+" : ""}
                  {pd.returnPct.toFixed(1)}%
                </p>
                <p className="text-xs text-zinc-500">
                  {pd.wins}W / {pd.losses}L
                </p>
              </div>
            ))}
          </div>

          {/* Per-strategy breakdown */}
          {byStrategy.length > 0 && (
            <div>
              <div className="grid grid-cols-5 gap-2 pb-1.5 mb-1 border-b border-zinc-700">
                <span className="text-xs text-zinc-600 col-span-2">Strategy</span>
                <span className="text-xs text-zinc-600 text-center">Win%</span>
                <span className="text-xs text-zinc-600 text-center">Trades</span>
                <span className="text-xs text-zinc-600 text-center">Avg Ret</span>
              </div>
              {byStrategy.map((s) => (
                <StrategyRow key={s.strategyType} stats={s} />
              ))}
            </div>
          )}

          {byStrategy.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-3">
              No resolved trades yet — performance data appears after outcomes are recorded.
            </p>
          )}

          {/* Additional stats */}
          <div className="mt-4 space-y-0">
            <StatRow
              label="Max Drawdown"
              value={`${overall.maxDrawdownPct.toFixed(1)}%`}
            />
            <StatRow
              label="Avg Win"
              value={`+${overall.avgWinPct.toFixed(1)}%`}
            />
            <StatRow
              label="Avg Loss"
              value={`${overall.avgLossPct.toFixed(1)}%`}
            />
            {overall.profitFactor != null && (
              <StatRow
                label="Profit Factor"
                value={overall.profitFactor.toFixed(2)}
                highlight={overall.profitFactor >= 1.5}
              />
            )}
          </div>
        </>
      )}
    </Card>
  );
}
