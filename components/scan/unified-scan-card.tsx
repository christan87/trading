"use client";

import { useState } from "react";
import type { ScanResult, RejectedScan, PennyRejectedCandidate } from "@/lib/db/models";

// ── Shared helpers ──────────────────────────────────────────────────────────

function fmt(d: Date | string | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function detectAssetType(result: ScanResult): "equity" | "option" | "penny" {
  if (result.pennyStockDetails) return "penny";
  if (result.optionScanDetails) return "option";
  return "equity";
}

const ASSET_TYPE_BADGE: Record<string, string> = {
  equity: "bg-zinc-800 text-zinc-300",
  option: "bg-yellow-900/40 text-yellow-300",
  penny: "bg-amber-900/40 text-amber-300",
};

const ASSET_TYPE_LABEL: Record<string, string> = {
  equity: "Equity",
  option: "Option",
  penny: "Penny Stock",
};

const DIRECTION_BADGE: Record<ScanResult["direction"], string> = {
  bullish: "bg-emerald-900/50 text-emerald-400",
  bearish: "bg-red-900/50 text-red-400",
  neutral: "bg-zinc-800 text-zinc-400",
};

const DIRECTION_LABEL: Record<ScanResult["direction"], string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
};

function riskLabel(score: number): string {
  if (score <= 3) return "Low";
  if (score <= 5) return "Moderate";
  if (score <= 7) return "High";
  return "Very High";
}

function riskColor(score: number): string {
  if (score <= 3) return "text-emerald-400";
  if (score <= 5) return "text-yellow-400";
  if (score <= 7) return "text-orange-400";
  return "text-red-400";
}

function confidenceColor(n: number): string {
  if (n <= 40) return "bg-red-500";
  if (n <= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

// ── Sub-components ──────────────────────────────────────────────────────────

function RiskBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const bar = score <= 3 ? "bg-emerald-500" : score <= 5 ? "bg-yellow-500" : score <= 7 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs w-16 ${riskColor(score)}`}>
        {score}/10 · {riskLabel(score)}
      </span>
    </div>
  );
}

function ConfidenceGauge({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${confidenceColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums">{value}%</span>
    </div>
  );
}

function EntryRangeBar({ min, max, current }: { min: number; max: number; current: number }) {
  const span = max - min;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((current - min) / span) * 100)) : 50;
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>${min.toFixed(2)}</span>
        <span className="text-zinc-300 font-medium">${current.toFixed(2)}</span>
        <span>${max.toFixed(2)}</span>
      </div>
      <div className="relative h-1.5 bg-zinc-700 rounded-full">
        <div className="absolute inset-y-0 left-0 bg-zinc-600 rounded-full" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-yellow-400 border-2 border-zinc-900"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
    </div>
  );
}

function ExpandableText({ text, lines = 2 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const style = expanded ? {} : { WebkitLineClamp: lines, display: "-webkit-box", WebkitBoxOrient: "vertical" as const, overflow: "hidden" };
  return (
    <div>
      <p className="text-sm text-zinc-300 leading-relaxed" style={style}>{text}</p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-zinc-500 hover:text-zinc-300 mt-0.5"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

// ── Card header shared across all active results ────────────────────────────

function CardHeader({
  symbol,
  companyName,
  direction,
  assetType,
  confidence,
  scannedAt,
}: {
  symbol: string;
  companyName: string;
  direction: ScanResult["direction"];
  assetType: "equity" | "option" | "penny";
  confidence: number;
  scannedAt: Date | string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-white">{symbol}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIRECTION_BADGE[direction]}`}>
              {DIRECTION_LABEL[direction]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ASSET_TYPE_BADGE[assetType]}`}>
              {ASSET_TYPE_LABEL[assetType]}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{companyName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-zinc-500 mb-1">Confidence</p>
          <ConfidenceGauge value={confidence} />
        </div>
      </div>
      <p className="text-xs text-zinc-600">{fmt(scannedAt)}</p>
    </div>
  );
}

// ── Common body section (all active scan types) ─────────────────────────────

function CommonBody({ result }: { result: ScanResult }) {
  const ai = result.aiAnalysis;
  return (
    <div className="space-y-3">
      {result.entryRange && (
        <div>
          <p className="text-xs text-zinc-500 mb-1">Entry Range</p>
          <EntryRangeBar
            min={result.entryRange.min}
            max={result.entryRange.max}
            current={result.entryRange.currentPrice}
          />
          {result.entryRange.rationale && (
            <p className="text-xs text-zinc-600 mt-1">{result.entryRange.rationale}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          result.expectedImpact === "high" ? "bg-emerald-900/40 text-emerald-400" :
          result.expectedImpact === "moderate" ? "bg-yellow-900/40 text-yellow-400" :
          "bg-zinc-800 text-zinc-400"
        }`}>
          {result.expectedImpact.charAt(0).toUpperCase() + result.expectedImpact.slice(1)} impact
        </span>
        <span className="text-xs text-zinc-500">{result.impactTimeframe}</span>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-1">Risk Score</p>
        <RiskBar score={result.riskScore} />
      </div>

      {ai?.thesis && (
        <div>
          <p className="text-xs text-zinc-500 mb-1">Analysis</p>
          <ExpandableText text={ai.thesis} lines={2} />
        </div>
      )}

      {ai && (ai.catalysts.length > 0 || ai.risks.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {ai.catalysts.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Catalysts</p>
              {ai.catalysts.map((c, i) => (
                <p key={i} className="text-xs text-emerald-400">+ {c}</p>
              ))}
            </div>
          )}
          {ai.risks.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Risks</p>
              {ai.risks.map((r, i) => (
                <p key={i} className="text-xs text-red-400">− {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Type-specific sections ──────────────────────────────────────────────────

function EquitySection({ result }: { result: ScanResult }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-xs text-zinc-500">
        <span>{result.sector}</span>
        {result.industry !== result.sector && <span>{result.industry}</span>}
      </div>
      {result.congressCluster && result.congressCluster.direction !== "neutral" && (
        <div className="bg-zinc-800/60 rounded-lg p-2.5">
          <p className="text-xs text-zinc-400 mb-1">Congressional Activity</p>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-400">{result.congressCluster.purchases} purchases</span>
            <span className="text-red-400">{result.congressCluster.sales} sales</span>
            <span className="text-zinc-500">{result.congressCluster.members.length} members</span>
          </div>
        </div>
      )}
    </div>
  );
}

const STRATEGY_LABELS: Record<string, string> = {
  covered_call: "Covered Call",
  cash_secured_put: "Cash-Secured Put",
  bull_call_spread: "Bull Call Spread",
  protective_put: "Protective Put",
};

function OptionsSection({ result }: { result: ScanResult }) {
  const det = result.optionScanDetails!;
  const strategyLabel = STRATEGY_LABELS[det.optionStrategy] ?? det.optionStrategy;
  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-xs text-zinc-500">
        <span>{result.sector}</span>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-300 font-medium">{strategyLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">Contract</p>
          <p className="text-zinc-200 font-medium">
            {det.contractType.toUpperCase()} ${det.strike} exp {det.expiration}
          </p>
          <p className="text-zinc-400">{det.daysToExpiration}d to expiry</p>
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">Liquidity</p>
          <p className="text-zinc-200 font-medium">OI: {det.openInterest.toLocaleString()}</p>
          {det.volumeOiRatio !== null && (
            <p className="text-zinc-400">Vol/OI: {det.volumeOiRatio.toFixed(2)}</p>
          )}
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">IV Rank</p>
          <p className="text-zinc-200 font-medium">
            {det.ivRank !== null ? `${det.ivRank}/100` : "—"}
          </p>
          {det.impliedVolatility !== null && (
            <p className="text-zinc-400">IV: {(det.impliedVolatility * 100).toFixed(1)}%</p>
          )}
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">Bid-Ask Spread</p>
          {det.spreadPct !== null ? (
            <p className={`font-medium ${det.spreadPct < 0.05 ? "text-emerald-400" : det.spreadPct < 0.15 ? "text-yellow-400" : "text-red-400"}`}>
              {(det.spreadPct * 100).toFixed(1)}%
            </p>
          ) : (
            <p className="text-zinc-400">—</p>
          )}
        </div>
      </div>
      {result.congressCluster && result.congressCluster.direction !== "neutral" && (
        <div className="bg-zinc-800/60 rounded-lg p-2.5">
          <p className="text-xs text-zinc-400 mb-1">Congressional Activity</p>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-400">{result.congressCluster.purchases} purchases</span>
            <span className="text-red-400">{result.congressCluster.sales} sales</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PennySection({ result }: { result: ScanResult }) {
  const det = result.pennyStockDetails!;
  return (
    <div className="space-y-2">
      <div className="bg-amber-950/50 border border-amber-900/60 rounded-lg p-2.5">
        <p className="text-xs font-semibold text-amber-400 mb-0.5">
          Penny stocks carry significantly higher risk of loss.
        </p>
        <p className="text-xs text-amber-400/70">
          Subject to extreme volatility, thin liquidity, and potential manipulation.
          Recommended max: 2% of portfolio.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">1d / 5d / 20d</p>
          <p className={det.priceChange1d >= 0 ? "text-emerald-400" : "text-red-400"}>
            {det.priceChange1d.toFixed(1)}% / {det.priceChange5d.toFixed(1)}% / {det.priceChange20d.toFixed(1)}%
          </p>
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">Vol Spike</p>
          <p className={det.volumeSpike >= 2 ? "text-yellow-400 font-semibold" : det.volumeSpike >= 1.5 ? "text-yellow-400" : "text-zinc-300"}>
            {det.volumeSpike.toFixed(1)}x
          </p>
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-2">
          <p className="text-zinc-500 mb-0.5">Avg Volume</p>
          <p className="text-zinc-300">{Math.round(det.avgVolume20d).toLocaleString()}</p>
        </div>
      </div>
      <div className="flex gap-3 text-xs text-zinc-500">
        <span>{det.exchange}</span>
      </div>
      {result.congressCluster && result.congressCluster.direction !== "neutral" && (
        <div className="bg-zinc-800/60 rounded-lg p-2.5">
          <p className="text-xs text-zinc-400 mb-1">Congressional Activity</p>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-400">{result.congressCluster.purchases} purchases</span>
            <span className="text-red-400">{result.congressCluster.sales} sales</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active scan result card ──────────────────────────────────────────────────

interface ActiveCardProps {
  data: ScanResult;
  onStatusChange: (id: string, status: ScanResult["status"]) => void;
}

function ActiveCard({ data: result, onStatusChange }: ActiveCardProps) {
  const id = (result._id as unknown as { toString(): string }).toString();
  const assetType = detectAssetType(result);
  const confidence = result.aiAnalysis?.confidence ?? 0;
  const [watchlisted, setWatchlisted] = useState(false);

  const addToWatchlist = async () => {
    await fetch("/api/alpaca/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: result.symbol,
        priceWhenAdded: result.entryRange?.currentPrice ?? 0,
        sourceScanId: result.scanId,
      }),
    });
    setWatchlisted(true);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <CardHeader
        symbol={result.symbol}
        companyName={result.companyName}
        direction={result.direction}
        assetType={assetType}
        confidence={confidence}
        scannedAt={result.scannedAt}
      />

      {assetType === "equity" && <EquitySection result={result} />}
      {assetType === "option" && <OptionsSection result={result} />}
      {assetType === "penny" && <PennySection result={result} />}

      <CommonBody result={result} />

      {result.direction === "bearish" && (
        <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-2.5">
          <p className="text-xs text-red-300">
            Short positions and put options carry risk of significant loss. Short selling has theoretically unlimited loss potential.
          </p>
        </div>
      )}

      {result.aiAnalysis && (
        <p className="text-xs text-zinc-600 italic border-t border-zinc-800 pt-2">
          {result.aiAnalysis.disclaimer}
        </p>
      )}

      {(result.status === "new" || result.status === "viewed") && (
        <div className="flex gap-2 pt-1 flex-wrap">
          <button
            onClick={() => onStatusChange(id, "viewed")}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Mark Viewed
          </button>
          <button
            onClick={() => onStatusChange(id, "dismissed")}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={addToWatchlist}
            disabled={watchlisted}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            {watchlisted ? "Watching" : "+ Watchlist"}
          </button>
          <a
            href={`/dashboard?symbol=${result.symbol}`}
            onClick={() => onStatusChange(id, "promoted")}
            className="flex-1 text-xs text-center bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Analyze
          </a>
        </div>
      )}
    </div>
  );
}

// ── Rejected equity card (RejectedScan from market scan) ────────────────────

const REJECTION_SOURCE_LABEL: Record<RejectedScan["rejectionSource"], string> = {
  auto_filter: "Auto-filtered",
  user_dismiss: "Dismissed",
  low_confidence: "Low AI confidence",
};

interface RejectedEquityCardProps {
  data: RejectedScan;
  onRemove?: (id: string) => void;
}

function RejectedEquityCard({ data, onRemove }: RejectedEquityCardProps) {
  const id = (data._id as unknown as { toString(): string }).toString();
  const tracking = data.tracking;
  const latestCheckpoint = tracking.checkpoints[tracking.checkpoints.length - 1];
  const [watchlisted, setWatchlisted] = useState(false);

  const addToWatchlist = async () => {
    await fetch("/api/alpaca/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: data.symbol, priceWhenAdded: data.priceAtRejection }),
    });
    setWatchlisted(true);
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 space-y-3 opacity-75">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-zinc-300">{data.symbol}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-700 text-zinc-400">
                Rejected
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-800 text-zinc-500">
                {REJECTION_SOURCE_LABEL[data.rejectionSource]}
              </span>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">{data.snapshotAtRejection.sector}</p>
          </div>
          <p className="text-sm font-medium text-zinc-400">${data.priceAtRejection.toFixed(2)}</p>
        </div>
        <p className="text-xs text-zinc-600">{fmt(data.createdAt)}</p>
      </div>

      {data.snapshotAtRejection.triggerSummary && (
        <p className="text-xs text-zinc-500 leading-relaxed">{data.snapshotAtRejection.triggerSummary}</p>
      )}

      <p className="text-xs text-zinc-600 border border-zinc-800 rounded px-2 py-1">
        {data.rejectionReason}
      </p>

      {tracking.checkpoints.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 mb-1">Tracking since rejection</p>
          <div className="flex gap-4 text-xs">
            {latestCheckpoint && (
              <span className={latestCheckpoint.changePct >= 0 ? "text-emerald-400" : "text-red-400"}>
                Current: {latestCheckpoint.changePct >= 0 ? "+" : ""}{latestCheckpoint.changePct.toFixed(1)}%
              </span>
            )}
            <span className="text-emerald-400">Peak: +{tracking.peakGainPct.toFixed(1)}%</span>
            <span className="text-red-400">Trough: {tracking.peakLossPct.toFixed(1)}%</span>
          </div>
          {data.resolvedAt && tracking.wouldHaveBeenProfitable !== null && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${tracking.wouldHaveBeenProfitable ? "text-emerald-400" : "text-red-400"}`}>
              <span>{tracking.wouldHaveBeenProfitable ? "✓" : "✗"}</span>
              <span>{tracking.wouldHaveBeenProfitable ? "Would have been profitable" : "Would not have been profitable"}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <a
          href={`/dashboard?symbol=${data.symbol}`}
          className="flex-1 text-xs text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          Re-analyze
        </a>
        <button
          onClick={addToWatchlist}
          disabled={watchlisted}
          className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {watchlisted ? "Watching" : "Track"}
        </button>
        {onRemove && (
          <button
            onClick={() => onRemove(id)}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── Rejected penny card (PennyRejectedCandidate) ────────────────────────────

const PENNY_REJECTION_LABEL: Record<PennyRejectedCandidate["rejectionReason"], string> = {
  no_momentum: "Price flat, volume unchanged — no signal detected",
  low_ai_confidence: "AI score below threshold after full analysis",
  no_triggers: "No news or congressional activity found as catalyst",
  scan_cap: "Momentum confirmed but daily AI quota full (8 calls/scan)",
};

interface RejectedPennyCardProps {
  data: PennyRejectedCandidate;
  onRemove?: (symbol: string) => void;
}

function RejectedPennyCard({ data, onRemove }: RejectedPennyCardProps) {
  const [watchlisted, setWatchlisted] = useState(false);

  const addToWatchlist = async () => {
    await fetch("/api/alpaca/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: data.symbol, priceWhenAdded: data.price }),
    });
    setWatchlisted(true);
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 space-y-3 opacity-75">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-zinc-300">{data.symbol}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-700 text-zinc-400">
              Rejected
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-900/40 text-amber-400">
              Penny Stock
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">{data.companyName} · {data.exchange}</p>
        </div>
        <p className="text-sm font-medium text-zinc-400">${data.price.toFixed(4)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-zinc-800/40 rounded-lg p-2">
          <p className="text-zinc-600 mb-0.5">1d Change</p>
          <p className={data.priceChange1d >= 0 ? "text-emerald-400" : "text-red-400"}>
            {data.priceChange1d >= 0 ? "+" : ""}{data.priceChange1d.toFixed(1)}%
          </p>
        </div>
        <div className="bg-zinc-800/40 rounded-lg p-2">
          <p className="text-zinc-600 mb-0.5">Vol Spike</p>
          <p className="text-zinc-400">{data.volumeSpike.toFixed(1)}x</p>
        </div>
        <div className="bg-zinc-800/40 rounded-lg p-2">
          <p className="text-zinc-600 mb-0.5">Reason</p>
          <p className="text-zinc-500 leading-tight" style={{ fontSize: "0.65rem" }}>
            {PENNY_REJECTION_LABEL[data.rejectionReason]}
          </p>
        </div>
      </div>

      <p className="text-xs text-zinc-600">{fmt(data.scannedAt)}</p>

      <div className="flex gap-2 pt-1">
        <a
          href={`/dashboard?symbol=${data.symbol}`}
          className="flex-1 text-xs text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          Re-analyze
        </a>
        <button
          onClick={addToWatchlist}
          disabled={watchlisted}
          className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {watchlisted ? "Watching" : "Track"}
        </button>
        {onRemove && (
          <button
            onClick={() => onRemove(data.symbol)}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── Public unified component ─────────────────────────────────────────────────

export type UnifiedScanCardProps =
  | { mode: "scan"; data: ScanResult; onStatusChange: (id: string, status: ScanResult["status"]) => void }
  | { mode: "rejected_equity"; data: RejectedScan; onRemove?: (id: string) => void }
  | { mode: "rejected_penny"; data: PennyRejectedCandidate; onRemove?: (symbol: string) => void };

export function UnifiedScanCard(props: UnifiedScanCardProps) {
  if (props.mode === "rejected_equity") {
    return <RejectedEquityCard data={props.data} onRemove={props.onRemove} />;
  }
  if (props.mode === "rejected_penny") {
    return <RejectedPennyCard data={props.data} onRemove={props.onRemove} />;
  }
  return <ActiveCard data={props.data} onStatusChange={props.onStatusChange} />;
}
