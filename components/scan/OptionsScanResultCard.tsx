"use client";

import type { ScanResult } from "@/lib/db/models";

interface Props {
  result: ScanResult;
  onStatusChange: (id: string, status: ScanResult["status"]) => void;
}

const STRATEGY_LABELS: Record<string, string> = {
  covered_call: "Covered Call",
  cash_secured_put: "Cash-Secured Put",
  bull_call_spread: "Bull Call Spread",
  protective_put: "Protective Put",
};

function RiskBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score <= 3 ? "bg-emerald-500" : score <= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-6 text-right">{score}</span>
    </div>
  );
}

export function OptionsScanResultCard({ result, onStatusChange }: Props) {
  const id = (result._id as unknown as { toString(): string }).toString();
  const det = result.optionScanDetails;
  if (!det) return null;

  const strategyLabel = STRATEGY_LABELS[det.optionStrategy] ?? det.optionStrategy;
  const confidence = result.aiAnalysis?.confidence ?? 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-white">{result.symbol}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300 font-medium">
              OPTIONS
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
              {strategyLabel}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{result.companyName} · {result.sector}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-white">{confidence}/100</p>
          <p className="text-xs text-zinc-500">score</p>
        </div>
      </div>

      {/* Contract details */}
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
          <p className="text-zinc-500 mb-0.5">Spread</p>
          {det.spreadPct !== null ? (
            <p className={`font-medium ${det.spreadPct < 0.05 ? "text-emerald-400" : det.spreadPct < 0.15 ? "text-yellow-400" : "text-red-400"}`}>
              {(det.spreadPct * 100).toFixed(1)}%
            </p>
          ) : (
            <p className="text-zinc-400">—</p>
          )}
        </div>
      </div>

      {/* Thesis */}
      {result.aiAnalysis && (
        <div>
          <p className="text-xs text-zinc-300 leading-relaxed">{result.aiAnalysis.thesis}</p>
        </div>
      )}

      {/* Risk */}
      <div>
        <p className="text-xs text-zinc-500 mb-1">Risk Score</p>
        <RiskBar score={result.riskScore} />
      </div>

      {/* Catalysts / Risks */}
      {result.aiAnalysis && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {result.aiAnalysis.catalysts.length > 0 && (
            <div>
              <p className="text-zinc-500 mb-1">Catalysts</p>
              {result.aiAnalysis.catalysts.map((c, i) => (
                <p key={i} className="text-emerald-400">+ {c}</p>
              ))}
            </div>
          )}
          {result.aiAnalysis.risks.length > 0 && (
            <div>
              <p className="text-zinc-500 mb-1">Risks</p>
              {result.aiAnalysis.risks.map((r, i) => (
                <p key={i} className="text-red-400">− {r}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      {result.aiAnalysis && (
        <p className="text-xs text-zinc-600 italic border-t border-zinc-800 pt-2">
          {result.aiAnalysis.disclaimer}
        </p>
      )}

      {/* Actions */}
      {(result.status === "new" || result.status === "viewed") && (
        <div className="flex gap-2 pt-1">
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
          <a
            href={`/dashboard?symbol=${result.symbol}`}
            onClick={() => onStatusChange(id, "promoted")}
            className="flex-1 text-xs text-center bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Research
          </a>
        </div>
      )}
    </div>
  );
}
