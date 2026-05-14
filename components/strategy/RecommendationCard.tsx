"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RiskGauge } from "./RiskGauge";
import { OrderEntryPanel } from "./OrderEntryPanel";

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
    bestPractices: { score: number; label?: string; factors: string[]; methodology: string };
    datadriven: { score: number; factors: string[]; methodology: string };
    combined: { score: number; label: "low" | "moderate" | "high" | "very_high"; weightBestPractices: number; weightDataDriven: number };
  };
  confidence: number;
  rationale: string;
  outcome: { status: string };
  createdAt: string;
}

interface Props {
  rec: RecommendationDoc;
  onDecision?: (recommendationId: string, action: "accepted" | "dismissed" | "modified") => void;
}

const DIRECTION_BADGE = { long: "green" as const, short: "red" as const };
const TIMEFRAME_LABELS: Record<string, string> = { intraday: "Intraday", swing: "Swing", position: "Position" };

export function RecommendationCard({ rec, onDecision }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderError, setOrderError] = useState("");

  const handleDecision = async (action: "accepted" | "dismissed" | "modified") => {
    setDeciding(true);
    try {
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: rec._id, action }),
      });
      onDecision?.(rec._id, action);
    } finally {
      setDeciding(false);
    }
  };

  const handleOrderSubmit = async (qty: number) => {
    setOrderError("");
    const res = await fetch("/api/alpaca/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: rec.symbol,
        qty,
        side: rec.direction === "long" ? "buy" : "sell",
        type: "limit",
        time_in_force: "day",
        limit_price: rec.entry.price,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Order failed");
    }
    // Log the decision as accepted after order is placed
    await handleDecision("accepted");
    setShowOrderPanel(false);
  };

  const aiUnavailable = rec.risk.combined.weightDataDriven === 0;

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-bold text-white">{rec.symbol}</span>
          <Badge variant={DIRECTION_BADGE[rec.direction]}>{rec.direction.toUpperCase()}</Badge>
          <Badge variant="gray">{TIMEFRAME_LABELS[rec.timeframe] ?? rec.timeframe}</Badge>
          <Badge variant="blue">{rec.strategyType.replace(/_/g, " ")}</Badge>
          {rec.assetType === "option" && <Badge variant="yellow">OPTIONS</Badge>}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Confidence: <span className="text-white font-medium">{rec.confidence}%</span></span>
          <span>·</span>
          <span>{new Date(rec.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Key levels */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-zinc-800/50 rounded-lg p-2.5">
          <p className="text-xs text-zinc-500 mb-1">Entry</p>
          <p className="font-semibold text-white">${rec.entry.price.toFixed(2)}</p>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{rec.entry.condition}</p>
        </div>
        <div className="bg-emerald-900/20 border border-emerald-900 rounded-lg p-2.5">
          <p className="text-xs text-emerald-600 mb-1">Target</p>
          <p className="font-semibold text-emerald-400">${rec.target.price.toFixed(2)}</p>
          <p className="text-xs text-emerald-600">+{rec.target.expectedReturnPct.toFixed(1)}%</p>
        </div>
        <div className="bg-red-900/20 border border-red-900 rounded-lg p-2.5">
          <p className="text-xs text-red-600 mb-1">Stop Loss</p>
          <p className="font-semibold text-red-400">${rec.stopLoss.price.toFixed(2)}</p>
          <p className="text-xs text-red-600">−{rec.stopLoss.maxLossPct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Options details */}
      {rec.optionDetails && (
        <div className="bg-yellow-900/10 border border-yellow-900/40 rounded-lg p-3 text-xs space-y-1">
          <p className="text-yellow-400 font-semibold uppercase tracking-wider">Option Details</p>
          <div className="grid grid-cols-2 gap-x-4 text-zinc-300">
            <span>Type: <strong>{rec.optionDetails.contractType}</strong></span>
            <span>Strategy: <strong>{rec.optionDetails.suggestedStrategy.replace(/_/g, " ")}</strong></span>
            <span>Strike: <strong>${rec.optionDetails.suggestedStrike}</strong></span>
            <span>Expiry: <strong>{rec.optionDetails.suggestedExpiration}</strong></span>
          </div>
        </div>
      )}

      {/* Risk gauges */}
      <div className="space-y-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Risk Assessment</p>
        <RiskGauge
          score={rec.risk.bestPractices.score}
          label={rec.risk.bestPractices.score <= 3 ? "low" : rec.risk.bestPractices.score <= 5 ? "moderate" : rec.risk.bestPractices.score <= 7 ? "high" : "very_high"}
          title="Tier 1 — Rules-Based"
        />
        <RiskGauge
          score={rec.risk.datadriven.score}
          label={rec.risk.datadriven.score <= 3 ? "low" : rec.risk.datadriven.score <= 5 ? "moderate" : rec.risk.datadriven.score <= 7 ? "high" : "very_high"}
          title="Tier 2 — AI Data-Driven"
          availabilityNote={aiUnavailable ? "AI analysis unavailable — using rules-based only" : undefined}
        />
        <RiskGauge
          score={rec.risk.combined.score}
          label={rec.risk.combined.label}
          title={`Tier 3 — Combined (${Math.round(rec.risk.combined.weightBestPractices * 100)}% rules / ${Math.round(rec.risk.combined.weightDataDriven * 100)}% AI)`}
        />
      </div>

      {/* Rationale (expandable) */}
      <div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
        >
          {expanded ? "▾" : "▸"} AI Rationale
        </button>
        {expanded && (
          <p className="mt-2 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {rec.rationale}
          </p>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-zinc-600 italic border-t border-zinc-800 pt-3">
        This is an AI-generated analysis for informational purposes only. It is not investment advice.
      </p>

      {/* Actions */}
      {rec.outcome.status === "pending" && !showOrderPanel && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowOrderPanel(true)}
            disabled={deciding}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Accept Trade
          </button>
          <button
            onClick={() => handleDecision("dismissed")}
            disabled={deciding}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Order entry panel */}
      {rec.outcome.status === "pending" && showOrderPanel && (
        <>
          {orderError && <p className="text-xs text-red-400">{orderError}</p>}
          <OrderEntryPanel
            symbol={rec.symbol}
            side={rec.direction === "long" ? "buy" : "sell"}
            currentPrice={rec.entry.price}
            assetType={rec.assetType}
            contractPrice={
              rec.assetType === "option" && rec.optionDetails
                ? rec.entry.price
                : undefined
            }
            onSubmit={handleOrderSubmit}
            onCancel={() => setShowOrderPanel(false)}
          />
        </>
      )}
      {rec.outcome.status === "tracking" && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-xs text-yellow-400 font-medium">Tracking outcome</span>
        </div>
      )}
      {rec.outcome.status === "resolved" && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-500" />
          <span className="text-xs text-zinc-500">Resolved</span>
        </div>
      )}
    </Card>
  );
}
