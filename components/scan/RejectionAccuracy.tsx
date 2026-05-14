"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { RejectionAccuracyStats } from "@/lib/services/rejected-scan-tracker";

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

export function RejectionAccuracy() {
  const [stats, setStats] = useState<RejectionAccuracyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scan/rejection-accuracy")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!stats || stats.total === 0) return null;

  const accuracyColor =
    stats.accuracyPct === null
      ? "text-zinc-400"
      : stats.accuracyPct >= 70
      ? "text-emerald-400"
      : stats.accuracyPct >= 50
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filter Accuracy</CardTitle>
      </CardHeader>
      <p className="text-xs text-zinc-500 mb-4">
        Tracks whether stocks the scan filtered out would have been profitable had they been kept.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <StatCell label="Total filtered" value={stats.total} />
        <StatCell label="Resolved (30d)" value={stats.resolved} />
        <StatCell label="Correctly filtered" value={stats.correctlyRejected} />
        <StatCell label="Missed opportunities" value={stats.missedOpportunities} />
      </div>

      <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500">
            {stats.accuracyPct === null
              ? `Need ${5 - stats.resolved} more resolved to show accuracy`
              : "Filter accuracy (correctly filtered / resolved)"}
          </p>
        </div>
        <p className={`text-2xl font-bold ${accuracyColor}`}>
          {stats.accuracyPct === null ? "—" : `${stats.accuracyPct}%`}
        </p>
      </div>
    </Card>
  );
}
