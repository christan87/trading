"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";

type Interval = "disabled" | "6h" | "12h" | "24h" | "48h";
type ScanType = "market" | "penny" | "options";

interface ScanSchedule {
  interval: Interval;
  enabledTypes: ScanType[];
  lastRunAt?: string;
}

interface CostEstimates {
  market: number;
  penny: number;
  options: number;
}

const INTERVAL_LABELS: Record<Interval, string> = {
  disabled: "Disabled",
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
  "24h": "Daily",
  "48h": "Every 2 days",
};

const SCAN_LABELS: Record<ScanType, string> = {
  market: "Market Scan",
  penny: "Penny Stock Scan",
  options: "Options Scan",
};

const RUNS_PER_MONTH: Record<Interval, number> = {
  disabled: 0,
  "6h": 124,
  "12h": 62,
  "24h": 31,
  "48h": 16,
};

function estimateMonthlyCost(interval: Interval, enabledTypes: ScanType[], costCents: CostEstimates): number {
  const runsPerMonth = RUNS_PER_MONTH[interval] ?? 0;
  const costPerRun = enabledTypes.reduce((sum, t) => sum + (costCents[t] ?? 0), 0);
  return (runsPerMonth * costPerRun) / 100; // convert cents to dollars
}

export function ScanSchedulePanel() {
  const [schedule, setSchedule] = useState<ScanSchedule>({ interval: "disabled", enabledTypes: [] });
  const [costEstimates, setCostEstimates] = useState<CostEstimates>({ market: 8, penny: 3, options: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/user/preferences").then((r) => r.json()),
      fetch("/api/jobs/scheduled-scans").then((r) => r.json()),
    ]).then(([prefs, meta]) => {
      if (prefs.scanSchedule) setSchedule(prefs.scanSchedule as ScanSchedule);
      if (meta.costEstimates) setCostEstimates(meta.costEstimates as CostEstimates);
    }).finally(() => setLoading(false));
  }, []);

  const toggleType = (type: ScanType) => {
    setSchedule((prev) => ({
      ...prev,
      enabledTypes: prev.enabledTypes.includes(type)
        ? prev.enabledTypes.filter((t) => t !== type)
        : [...prev.enabledTypes, type],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanSchedule: schedule }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Save failed");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const monthlyCost = estimateMonthlyCost(schedule.interval, schedule.enabledTypes, costEstimates);

  if (loading) {
    return <div className="h-40 bg-zinc-800 rounded-xl animate-pulse" />;
  }

  return (
    <Card>
      <p className="text-sm font-semibold text-zinc-300 mb-1">Automated Scan Schedule</p>
      <p className="text-xs text-zinc-500 mb-4">
        Scans run automatically in the background. Each scan consumes your daily scan quota.
      </p>

      <div className="space-y-4">
        {/* Interval selector */}
        <div>
          <label className="text-xs text-zinc-500 block mb-2">Run interval</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(INTERVAL_LABELS) as Interval[]).map((iv) => (
              <button
                key={iv}
                onClick={() => setSchedule((prev) => ({ ...prev, interval: iv }))}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  schedule.interval === iv
                    ? "bg-yellow-500 border-yellow-500 text-black font-semibold"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {INTERVAL_LABELS[iv]}
              </button>
            ))}
          </div>
        </div>

        {/* Scan type checkboxes */}
        {schedule.interval !== "disabled" && (
          <div>
            <label className="text-xs text-zinc-500 block mb-2">Scan types to run</label>
            <div className="space-y-2">
              {(["market", "penny", "options"] as ScanType[]).map((type) => (
                <label key={type} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={schedule.enabledTypes.includes(type)}
                    onChange={() => toggleType(type)}
                    className="w-3.5 h-3.5 accent-yellow-500"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                    {SCAN_LABELS[type]}
                  </span>
                  <span className="text-xs text-zinc-600">
                    ~${(costEstimates[type] / 100).toFixed(2)}/run
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Cost estimate */}
        {schedule.interval !== "disabled" && schedule.enabledTypes.length > 0 && (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Estimated monthly Claude API cost</span>
              <span className={`font-semibold ${monthlyCost < 1 ? "text-emerald-400" : monthlyCost < 5 ? "text-yellow-400" : "text-red-400"}`}>
                ~${monthlyCost.toFixed(2)}/month
              </span>
            </div>
            <p className="text-xs text-zinc-600 mt-1">
              {RUNS_PER_MONTH[schedule.interval]} runs/mo × {schedule.enabledTypes.length} scan{schedule.enabledTypes.length > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Last run */}
        {schedule.lastRunAt && (
          <p className="text-xs text-zinc-600">
            Last run: {new Date(schedule.lastRunAt).toLocaleString()}
          </p>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {saved && <p className="text-xs text-emerald-400">Saved.</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save Schedule"}
        </button>
      </div>
    </Card>
  );
}
