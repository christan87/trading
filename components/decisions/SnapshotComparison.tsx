"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface RecommendationDetail {
  symbol: string;
  strategyType: string;
  direction: string;
  entry: { price: number; condition: string };
  target: { price: number; expectedReturnPct: number };
  stopLoss: { price: number; maxLossPct: number };
  rationale: string;
  snapshot: {
    priceData: { currentPrice: number; technicalIndicators: Record<string, number> };
    newsArticles: { headline: string; sentiment: string | null; publishedAt: string }[];
    congressTrades: { memberName: string; transactionType: string }[];
    macroIndicators: Record<string, number>;
    marketConditions: { vix: number; spyChange30d: number };
    claudeModelVersion: string;
  };
  risk: { combined: { score: number; label: string } };
  outcome: {
    status: string;
    finalResult: {
      exitPrice: number;
      returnPct: number;
      hitTarget: boolean;
      hitStopLoss: boolean;
      holdingPeriodDays: number;
      exitReason: string;
    } | null;
    performedAsExpected: boolean | null;
    postMortem: string | null;
    checkpoints: { date: string; currentPrice: number; percentChange: number; onTrack: boolean }[];
  };
  createdAt: string;
}

interface Props {
  recommendationId: string;
  onClose: () => void;
}

export function SnapshotComparison({ recommendationId, onClose }: Props) {
  const [rec, setRec] = useState<RecommendationDetail | null>(null);

  useEffect(() => {
    fetch(`/api/recommendations/${recommendationId}`)
      .then((r) => r.json())
      .then(setRec);
  }, [recommendationId]);

  if (!rec) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-2xl p-8">
          <p className="text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  const result = rec.outcome.finalResult;
  const isResolved = rec.outcome.status === "resolved";
  const returnColor = (result?.returnPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-white">{rec.symbol} · Snapshot Comparison</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {rec.strategyType.replace(/_/g, " ")} · {rec.direction} · Recommended {new Date(rec.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
          {/* Left: At-recommendation snapshot */}
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">When Recommended</h3>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500 text-xs">Price at recommendation</p>
                <p className="text-white font-semibold">${rec.snapshot.priceData.currentPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">VIX</p>
                <p className="text-white font-semibold">{rec.snapshot.marketConditions.vix.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Target</p>
                <p className="text-emerald-400 font-semibold">${rec.target.price.toFixed(2)} (+{rec.target.expectedReturnPct.toFixed(1)}%)</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Stop Loss</p>
                <p className="text-red-400 font-semibold">${rec.stopLoss.price.toFixed(2)} (−{rec.stopLoss.maxLossPct.toFixed(1)}%)</p>
              </div>
            </div>

            {Object.keys(rec.snapshot.priceData.technicalIndicators).length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs mb-1">Technical Indicators</p>
                <div className="text-xs space-y-0.5">
                  {Object.entries(rec.snapshot.priceData.technicalIndicators).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-zinc-400">{k.toUpperCase()}</span>
                      <span className="text-zinc-300">{typeof v === "number" ? v.toFixed(2) : v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rec.snapshot.newsArticles.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs mb-1">News at time of recommendation ({rec.snapshot.newsArticles.length})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {rec.snapshot.newsArticles.slice(0, 5).map((n, i) => (
                    <div key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                      <Badge variant={n.sentiment === "positive" ? "green" : n.sentiment === "negative" ? "red" : "gray"}>
                        {n.sentiment ?? "?"}
                      </Badge>
                      <span className="line-clamp-1">{n.headline}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rec.snapshot.congressTrades.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs mb-1">Congressional activity</p>
                {rec.snapshot.congressTrades.slice(0, 3).map((t, i) => (
                  <p key={i} className="text-xs text-zinc-400">
                    {t.memberName}: <span className={t.transactionType === "purchase" ? "text-emerald-400" : "text-red-400"}>{t.transactionType}</span>
                  </p>
                ))}
              </div>
            )}

            <div>
              <p className="text-zinc-500 text-xs mb-1">AI Rationale</p>
              <p className="text-xs text-zinc-300 leading-relaxed line-clamp-6">{rec.rationale}</p>
            </div>
          </div>

          {/* Right: What actually happened */}
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">What Actually Happened</h3>

            {isResolved && result ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-zinc-500 text-xs">Exit Price</p>
                    <p className="text-white font-semibold">${result.exitPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Return</p>
                    <p className={`font-semibold ${returnColor}`}>
                      {result.returnPct >= 0 ? "+" : ""}{result.returnPct.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Exit Reason</p>
                    <p className="text-white text-xs">{result.exitReason.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Holding Period</p>
                    <p className="text-white text-xs">{result.holdingPeriodDays} days</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={rec.outcome.performedAsExpected ? "green" : "red"}>
                    {rec.outcome.performedAsExpected ? "✓ Performed as expected" : "✗ Did not meet target"}
                  </Badge>
                </div>

                {rec.outcome.checkpoints.length > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs mb-2">Price Checkpoints</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {rec.outcome.checkpoints.map((cp, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-zinc-500">{new Date(cp.date).toLocaleDateString()}</span>
                          <span className="text-zinc-300">${cp.currentPrice.toFixed(2)}</span>
                          <span className={cp.percentChange >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {cp.percentChange >= 0 ? "+" : ""}{cp.percentChange.toFixed(2)}%
                          </span>
                          <span className={cp.onTrack ? "text-emerald-600" : "text-red-600"}>
                            {cp.onTrack ? "✓" : "✗"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {rec.outcome.postMortem && (
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">AI Post-Mortem Analysis</p>
                    <p className="text-xs text-zinc-300 leading-relaxed">{rec.outcome.postMortem}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 py-4">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-sm text-yellow-400">
                  {rec.outcome.status === "tracking" ? "Currently tracking this position" : "Not yet accepted"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
