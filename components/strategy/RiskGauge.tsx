interface RiskGaugeProps {
  score: number;
  label: string;
  title: string;
  availabilityNote?: string;
}

const SCORE_COLORS: Record<number, string> = {
  1: "bg-emerald-500",
  2: "bg-emerald-500",
  3: "bg-emerald-400",
  4: "bg-yellow-400",
  5: "bg-yellow-400",
  6: "bg-orange-400",
  7: "bg-orange-500",
  8: "bg-red-500",
  9: "bg-red-600",
  10: "bg-red-700",
};

const LABEL_COLORS: Record<string, string> = {
  low: "text-emerald-400",
  moderate: "text-yellow-400",
  high: "text-orange-400",
  very_high: "text-red-400",
};

export function RiskGauge({ score, label, title, availabilityNote }: RiskGaugeProps) {
  const barColor = SCORE_COLORS[Math.min(10, Math.max(1, score))] ?? "bg-zinc-500";
  const labelColor = LABEL_COLORS[label] ?? "text-zinc-400";
  const pct = ((score - 1) / 9) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{title}</span>
        <span className={`text-xs font-semibold ${labelColor}`}>
          {score}/10 · {label.replace("_", " ")}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {availabilityNote && (
        <p className="text-xs text-zinc-600 italic">{availabilityNote}</p>
      )}
    </div>
  );
}
