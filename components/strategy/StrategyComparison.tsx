"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { SimulationResult, SimulatedStrategy } from "@/lib/services/strategy-simulator";

const TIMEFRAMES = ["intraday", "swing", "position"] as const;

function RiskBar({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100;
  const color =
    label === "low"
      ? "bg-emerald-500"
      : label === "moderate"
      ? "bg-yellow-500"
      : label === "high"
      ? "bg-orange-500"
      : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-12 text-right">{score.toFixed(1)}/10</span>
    </div>
  );
}

function StrategyCard({
  strategy,
  isRecommended,
}: {
  strategy: SimulatedStrategy;
  isRecommended: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border transition-all ${
        isRecommended
          ? "border-yellow-500/50 bg-yellow-500/5"
          : "border-zinc-700/50 bg-zinc-800/30"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-zinc-200">
            {strategy.strategyType.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-zinc-500 capitalize">{strategy.direction}</p>
        </div>
        <div className="text-right">
          {isRecommended && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-medium">
              Recommended
            </span>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            {strategy.confidence}% confidence
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <p className="text-zinc-600 mb-0.5">Entry</p>
          <p className="text-zinc-300 font-medium">${strategy.entry.price.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-zinc-600 mb-0.5">Target</p>
          <p className="text-emerald-400 font-medium">
            ${strategy.target.price.toFixed(2)}
            <span className="text-zinc-500 ml-1">
              (+{strategy.target.expectedReturnPct.toFixed(1)}%)
            </span>
          </p>
        </div>
        <div>
          <p className="text-zinc-600 mb-0.5">Stop</p>
          <p className="text-red-400 font-medium">
            ${strategy.stopLoss.price.toFixed(2)}
            <span className="text-zinc-500 ml-1">
              ({strategy.stopLoss.maxLossPct.toFixed(1)}%)
            </span>
          </p>
        </div>
      </div>

      <RiskBar score={strategy.riskScore} label={strategy.riskLabel} />

      <p className="text-xs text-zinc-500 mt-3 line-clamp-3">{strategy.rationale}</p>
    </div>
  );
}

export function StrategyComparison() {
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<"intraday" | "swing" | "position">("swing");
  const [count, setCount] = useState(5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);

  const run = async () => {
    if (!symbol.trim()) return;
    setRunning(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/strategies/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.toUpperCase().trim(), timeframe, count }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Simulation failed");
        return;
      }
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parallel Strategy Simulator</CardTitle>
      </CardHeader>
      <p className="text-xs text-zinc-500 mb-4">
        Run multiple strategy types simultaneously on the same ticker to compare setups side by side.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Ticker</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="e.g. AAPL"
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white placeholder-zinc-500 w-28 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white"
          >
            {TIMEFRAMES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Strategies</label>
          <select
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={run}
          disabled={running || !symbol.trim()}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {running ? "Simulating…" : "Simulate"}
        </button>
      </div>

      {running && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
          <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          Running {count} strategies in parallel…
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{result.symbol}</p>
              <p className="text-xs text-zinc-500">{result.strategies.length} strategies compared</p>
            </div>
            <span className="text-xs text-zinc-600">
              {new Date(result.generatedAt).toLocaleTimeString()}
            </span>
          </div>

          {result.recommendedRationale && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400 font-medium mb-1">
                Why {result.recommendedStrategy.replace(/_/g, " ")} fits best:
              </p>
              <p className="text-xs text-zinc-400">{result.recommendedRationale}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {result.strategies.map((s) => (
              <StrategyCard
                key={s.strategyType}
                strategy={s}
                isRecommended={s.strategyType === result.recommendedStrategy}
              />
            ))}
          </div>

          <p className="text-xs text-zinc-600 italic text-center">
            This is an AI-generated analysis for informational purposes only. It is not investment advice.
          </p>
        </div>
      )}
    </Card>
  );
}
