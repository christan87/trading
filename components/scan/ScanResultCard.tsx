"use client";

import type { ScanResult } from "@/lib/db/models";

interface Props {
  result: ScanResult;
  onStatusChange: (id: string, status: ScanResult["status"]) => void;
}

const TRIGGER_LABELS: Record<ScanResult["triggerType"], string> = {
  political_event: "Political",
  congress_trade: "Congress",
  contract_award: "Contract",
  regulatory: "Regulatory",
};

const TRIGGER_COLORS: Record<ScanResult["triggerType"], string> = {
  political_event: "bg-purple-900/40 text-purple-300",
  congress_trade: "bg-blue-900/40 text-blue-300",
  contract_award: "bg-green-900/40 text-green-300",
  regulatory: "bg-orange-900/40 text-orange-300",
};

const DIRECTION_COLOR = {
  long: "text-emerald-400",
  short: "text-red-400",
  watch: "text-yellow-400",
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

export function ScanResultCard({ result, onStatusChange }: Props) {
  const id = (result._id as unknown as { toString(): string }).toString();
  const { aiAnalysis } = result;

  const statusBadge =
    result.status === "reviewed"
      ? "border-zinc-600 text-zinc-400"
      : result.status === "acted"
      ? "border-emerald-600 text-emerald-400"
      : "border-zinc-700 text-zinc-500";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-white">{result.symbol}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${TRIGGER_COLORS[result.triggerType]}`}
            >
              {TRIGGER_LABELS[result.triggerType]}
            </span>
            {result.status !== "new" && (
              <span className={`text-xs border px-2 py-0.5 rounded-full ${statusBadge}`}>
                {result.status}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">
            {result.companyName} · {result.sector}
          </p>
        </div>
        {aiAnalysis && (
          <div className="text-right shrink-0">
            <p
              className={`text-sm font-semibold ${DIRECTION_COLOR[aiAnalysis.suggestedDirection]}`}
            >
              {aiAnalysis.suggestedDirection.toUpperCase()}
            </p>
            <p className="text-xs text-zinc-500">{aiAnalysis.suggestedTimeframe}</p>
          </div>
        )}
      </div>

      {/* Risk bar */}
      <div>
        <p className="text-xs text-zinc-500 mb-1">Risk Score</p>
        <RiskBar score={result.riskScore} />
      </div>

      {/* AI thesis */}
      {aiAnalysis && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-300 leading-relaxed">{aiAnalysis.thesis}</p>

          {aiAnalysis.catalysts.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Catalysts</p>
              <ul className="space-y-0.5">
                {aiAnalysis.catalysts.map((c, i) => (
                  <li key={i} className="text-xs text-emerald-400 flex gap-1">
                    <span>+</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {aiAnalysis.risks.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Risks</p>
              <ul className="space-y-0.5">
                {aiAnalysis.risks.map((r, i) => (
                  <li key={i} className="text-xs text-red-400 flex gap-1">
                    <span>−</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-zinc-500">
              Confidence: {aiAnalysis.confidence}%
            </span>
          </div>
        </div>
      )}

      {/* Congress cluster */}
      {result.congressCluster && result.congressCluster.direction !== "neutral" && (
        <div className="bg-zinc-800/60 rounded-lg p-2.5">
          <p className="text-xs text-zinc-400 mb-1">Congressional Activity (30d)</p>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-400">{result.congressCluster.purchases} purchases</span>
            <span className="text-red-400">{result.congressCluster.sales} sales</span>
            <span className="text-zinc-500">{result.congressCluster.members.length} members</span>
          </div>
        </div>
      )}

      {/* Triggers */}
      {result.triggers.length > 0 && (
        <div className="space-y-1">
          {result.triggers.map((t, i) => (
            <p key={i} className="text-xs text-zinc-500 leading-relaxed">
              <span className={`font-medium ${TRIGGER_COLORS[t.type].split(" ")[1]}`}>
                [{TRIGGER_LABELS[t.type]}]
              </span>{" "}
              {t.description}
            </p>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      {aiAnalysis && (
        <p className="text-xs text-zinc-600 italic border-t border-zinc-800 pt-2">
          {aiAnalysis.disclaimer}
        </p>
      )}

      {/* Actions */}
      {result.status === "new" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onStatusChange(id, "reviewed")}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Mark Reviewed
          </button>
          <button
            onClick={() => onStatusChange(id, "dismissed")}
            className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Dismiss
          </button>
          <a
            href={`/dashboard?symbol=${result.symbol}`}
            className="flex-1 text-xs text-center bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Analyze
          </a>
        </div>
      )}
    </div>
  );
}
