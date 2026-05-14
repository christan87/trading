"use client";

import { useState, useEffect } from "react";
import { RecommendationCard } from "@/components/strategy/RecommendationCard";
import { ResearchWorkbench } from "@/components/strategy/ResearchWorkbench";
import { TipsPanel } from "@/components/learning/TipsPanel";
import { PerformanceStats } from "@/components/strategy/PerformanceStats";
import { StrategyComparison } from "@/components/strategy/StrategyComparison";
import { PoliticalCorrelation } from "@/components/strategy/PoliticalCorrelation";
import { CongressPatterns } from "@/components/strategy/CongressPatterns";
import { AdaptationPanel } from "@/components/strategy/AdaptationPanel";
import { Card } from "@/components/ui/Card";
import type { AiStatus } from "@/lib/services/ai-fallback";

interface RecommendationDoc {
  _id: string;
  symbol: string;
  assetType: "equity" | "option";
  strategyType: string;
  timeframe: string;
  direction: "long" | "short";
  entry: { price: number; condition: string };
  target: { price: number; expectedReturnPct: number };
  stopLoss: { price: number; maxLossPct: number };
  optionDetails: {
    contractType: "call" | "put";
    suggestedStrike: number;
    suggestedExpiration: string;
    suggestedStrategy: string;
  } | null;
  risk: {
    bestPractices: { score: number; factors: string[]; methodology: string };
    datadriven: { score: number; factors: string[]; methodology: string };
    combined: { score: number; label: "low" | "moderate" | "high" | "very_high"; weightBestPractices: number; weightDataDriven: number };
  };
  confidence: number;
  rationale: string;
  outcome: { status: string };
  createdAt: string;
}

const TIMEFRAMES = ["intraday", "swing", "position"] as const;
const STRATEGIES = ["", "momentum", "mean_reversion", "earnings_play", "options_spread", "breakout"];

export default function StrategyPage() {
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<"intraday" | "swing" | "position">("swing");
  const [strategyType, setStrategyType] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [recommendations, setRecommendations] = useState<RecommendationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState<AiStatus>("available");

  useEffect(() => {
    fetch("/api/recommendations?limit=10")
      .then((r) => r.json())
      .then((d) => {
        setRecommendations(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setAiStatus(d.status));
  }, []);

  const runAnalysis = async () => {
    if (!symbol.trim()) return;
    setRunning(true);
    setError("");

    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase().trim(),
          timeframe,
          strategyType: strategyType || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Analysis failed");
        return;
      }

      const newRec: RecommendationDoc = await res.json();
      setRecommendations((prev) => [newRec, ...prev]);
      setSymbol("");
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleDecision = (recId: string, action: "accepted" | "dismissed" | "modified") => {
    setRecommendations((prev) =>
      prev.map((r) =>
        r._id === recId
          ? { ...r, outcome: { ...r.outcome, status: action === "accepted" ? "tracking" : r.outcome.status } }
          : r
      )
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Strategy Console</h1>
      </div>

      {/* Analysis form */}
      <Card>
        <p className="text-sm font-semibold text-zinc-300 mb-3">Run New Analysis</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Ticker</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
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
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Strategy (optional)</label>
            <select
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">Auto-detect</option>
              {STRATEGIES.slice(1).map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <button
            onClick={runAnalysis}
            disabled={running || !symbol.trim()}
            className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            {running ? "Analyzing…" : "Analyze"}
          </button>
        </div>
        {running && (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            Gathering market data and running AI analysis…
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </Card>

      {/* Performance stats — always visible */}
      <PerformanceStats />

      {/* Research Workbench — shown when AI is offline */}
      {aiStatus === "unavailable" && <ResearchWorkbench />}

      {/* Contextual tips for the selected strategy */}
      {strategyType && aiStatus !== "unavailable" && (
        <TipsPanel strategyType={strategyType} defaultOpen={false} />
      )}

      {/* Phase 2 + 3 tools — shown when AI is available */}
      {aiStatus !== "unavailable" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <StrategyComparison />
            <PoliticalCorrelation />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CongressPatterns />
            <AdaptationPanel />
          </div>
        </>
      )}

      {/* Recommendations list */}
      {aiStatus !== "unavailable" && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2].map((i) => <div key={i} className="h-64 bg-zinc-800 rounded-xl" />)}
            </div>
          ) : recommendations.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-500">No recommendations yet. Enter a ticker above to run your first analysis.</p>
            </Card>
          ) : (
            recommendations.map((rec) => (
              <div key={rec._id} className="space-y-2">
                <RecommendationCard rec={rec} onDecision={handleDecision} />
                <TipsPanel strategyType={rec.strategyType} defaultOpen={false} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
