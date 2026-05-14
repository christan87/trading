"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { PoliticalCorrelationResult } from "@/lib/services/political-correlation";

function BiasChip({ bias }: { bias: "bullish" | "bearish" | "neutral" | "mixed" }) {
  const cfg = {
    bullish: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    bearish: "bg-red-500/15 text-red-400 border-red-500/30",
    neutral: "bg-zinc-700/50 text-zinc-400 border-zinc-600",
    mixed: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${cfg[bias]}`}
    >
      {bias}
    </span>
  );
}

export function PoliticalCorrelation() {
  const [symbol, setSymbol] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PoliticalCorrelationResult | null>(null);

  const run = async () => {
    if (!symbol.trim()) return;
    setRunning(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(
        `/api/political-correlation?symbol=${encodeURIComponent(symbol.toUpperCase().trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
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
        <CardTitle>Political Event Correlation</CardTitle>
      </CardHeader>
      <p className="text-xs text-zinc-500 mb-4">
        Analyze congressional trading patterns against historical analogs using Claude.
      </p>

      {/* Input */}
      <div className="flex gap-3 items-end mb-4">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Ticker</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="e.g. LMT"
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white placeholder-zinc-500 w-28 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <button
          onClick={run}
          disabled={running || !symbol.trim()}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {running ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {running && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
          <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          Fetching congressional disclosures and running historical analog analysis…
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

      {result && (
        <div className="space-y-4">
          {/* Current pattern */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-200">
                {result.symbol} — Last 90 days
              </p>
              <BiasChip bias={result.currentPattern.netBias} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs mb-3">
              <div>
                <p className="text-zinc-600 mb-0.5">Purchases</p>
                <p className="text-emerald-400 font-semibold text-base">
                  {result.currentPattern.totalPurchases}
                </p>
              </div>
              <div>
                <p className="text-zinc-600 mb-0.5">Sales</p>
                <p className="text-red-400 font-semibold text-base">
                  {result.currentPattern.totalSales}
                </p>
              </div>
              <div>
                <p className="text-zinc-600 mb-0.5">Cluster</p>
                <p
                  className={`font-semibold text-base capitalize ${
                    result.currentPattern.clusterStrength === "strong"
                      ? "text-yellow-400"
                      : result.currentPattern.clusterStrength === "moderate"
                      ? "text-zinc-300"
                      : "text-zinc-500"
                  }`}
                >
                  {result.currentPattern.clusterStrength}
                </p>
              </div>
            </div>
            {result.currentPattern.members.length > 0 && (
              <p className="text-xs text-zinc-600">
                Members:{" "}
                <span className="text-zinc-400">
                  {result.currentPattern.members.slice(0, 5).join(", ")}
                  {result.currentPattern.members.length > 5 &&
                    ` +${result.currentPattern.members.length - 5} more`}
                </span>
              </p>
            )}
          </div>

          {/* AI Analysis */}
          {result.aiAnalysis && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-zinc-400">AI Analysis</p>
                <div className="flex items-center gap-2">
                  <BiasChip bias={result.tradingImplication} />
                  <span className="text-xs text-zinc-600">
                    {result.confidenceScore}% confidence
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
                {result.aiAnalysis}
              </p>
            </div>
          )}

          {/* Historical analogs */}
          {result.historicalAnalogs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2">
                Historical Analogs
              </p>
              <div className="space-y-2">
                {result.historicalAnalogs.map((analog, i) => (
                  <div
                    key={i}
                    className="bg-zinc-800/40 rounded-lg p-3 border border-zinc-700/40"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-zinc-300">
                        {analog.period}
                      </p>
                      <span className="text-xs text-zinc-600">
                        {analog.similarity}% match
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-1.5">
                      {analog.description}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="text-zinc-600">Outcome: </span>
                      {analog.outcome}
                    </p>
                    {analog.keyFactors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {analog.keyFactors.map((f, fi) => (
                          <span
                            key={fi}
                            className="text-xs bg-zinc-700/60 text-zinc-400 px-1.5 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-zinc-600 italic text-center">
            {result.disclaimer}
          </p>
        </div>
      )}

      {!result && !running && (
        <p className="text-xs text-zinc-600 text-center py-4">
          Enter a ticker to analyze congressional trading patterns and historical analogs.
        </p>
      )}
    </Card>
  );
}
