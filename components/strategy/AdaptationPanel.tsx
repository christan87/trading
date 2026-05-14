"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { AdaptationSuggestion } from "@/lib/db/models";

const STRATEGY_OPTIONS = [
  "momentum",
  "mean_reversion",
  "breakout",
  "earnings_play",
  "options_spread",
];

function SuggestionRow({
  s,
}: {
  s: AdaptationSuggestion["suggestions"][number];
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 mb-2 last:mb-0">
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-medium text-zinc-300">
          {s.parameter.replace(/_/g, " ")}
        </span>
        <div className="flex items-center gap-1.5 text-xs ml-2">
          <span className="text-zinc-600 line-through">{s.currentValue}</span>
          <span className="text-yellow-400">→</span>
          <span className="text-emerald-400 font-medium">{s.suggestedValue}</span>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{s.rationale}</p>
    </div>
  );
}

function AdaptationCard({
  adaptation,
  onAcknowledge,
}: {
  adaptation: AdaptationSuggestion;
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acking, setAcking] = useState(false);

  const acknowledge = async () => {
    setAcking(true);
    try {
      await fetch(`/api/strategies/${adaptation.strategyType}/adapt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adaptationId: adaptation._id.toString() }),
      });
      onAcknowledge(adaptation._id.toString());
    } finally {
      setAcking(false);
    }
  };

  return (
    <div className="border border-zinc-700/60 rounded-xl p-4 mb-3 last:mb-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-zinc-200">
            {adaptation.strategyType.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-zinc-600">
            Based on {adaptation.losingTradeCount} losing trades ·{" "}
            {(adaptation.winRateAtGeneration * 100).toFixed(0)}% win rate at time of analysis
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            adaptation.status === "pending"
              ? "bg-yellow-500/20 text-yellow-400"
              : "bg-zinc-700 text-zinc-500"
          }`}
        >
          {adaptation.status}
        </span>
      </div>

      {expanded && (
        <div className="mb-3">
          <p className="text-xs text-zinc-400 leading-relaxed mb-3">
            {adaptation.analysis}
          </p>
          {adaptation.suggestions.map((s, i) => (
            <SuggestionRow key={i} s={s} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? "Collapse" : `View ${adaptation.suggestions.length} suggestions`}
        </button>
        {adaptation.status === "pending" && (
          <button
            onClick={acknowledge}
            disabled={acking}
            className="ml-auto text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white px-3 py-1 rounded-lg transition-colors"
          >
            {acking ? "…" : "Acknowledge"}
          </button>
        )}
      </div>
    </div>
  );
}

export function AdaptationPanel() {
  const [strategyType, setStrategyType] = useState(STRATEGY_OPTIONS[0]);
  const [adaptations, setAdaptations] = useState<AdaptationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = (strategy: string) => {
    setLoading(true);
    setError("");
    fetch(`/api/strategies/${strategy}/adapt`)
      .then((r) => r.json())
      .then((d) => {
        setAdaptations(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load(strategyType);
  }, [strategyType]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/strategies/${strategyType}/adapt`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
        return;
      }
      setAdaptations((prev) => [data, ...prev]);
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleAcknowledge = (id: string) => {
    setAdaptations((prev) =>
      prev.map((a) =>
        a._id.toString() === id
          ? { ...a, status: "acknowledged", acknowledgedAt: new Date() }
          : a
      )
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adaptive Strategy Learning</CardTitle>
      </CardHeader>
      <p className="text-xs text-zinc-500 mb-4">
        Claude analyzes your losing trades for a strategy and suggests specific parameter improvements.
      </p>

      <div className="flex gap-3 items-end mb-4">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Strategy</label>
          <select
            value={strategyType}
            onChange={(e) => setStrategyType(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white"
          >
            {STRATEGY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {generating ? "Analyzing…" : "Run Analysis"}
        </button>
      </div>

      {generating && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
          <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          Analyzing losing trades and generating suggestions…
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && adaptations.length === 0 && (
        <p className="text-xs text-zinc-600 text-center py-4">
          No adaptation analyses yet. Run an analysis when your win rate drops to get targeted improvement suggestions.
        </p>
      )}

      {!loading &&
        adaptations.map((a) => (
          <AdaptationCard
            key={a._id.toString()}
            adaptation={a}
            onAcknowledge={handleAcknowledge}
          />
        ))}

      <p className="text-xs text-zinc-600 italic text-center mt-3">
        This is an AI-generated analysis for informational purposes only. It is not investment advice.
      </p>
    </Card>
  );
}
