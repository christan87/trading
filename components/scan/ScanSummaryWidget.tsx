"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ScanResult } from "@/lib/db/models";

interface ScanData {
  results: ScanResult[];
  recentRuns: { runId: string; scannedAt: string; count: number }[];
}

const DIRECTION_COLOR = {
  long: "text-emerald-400",
  short: "text-red-400",
  watch: "text-yellow-400",
};

export function ScanSummaryWidget() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const newResults = (data?.results ?? []).filter((r) => r.status === "new").slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Market Scan</CardTitle>
          <a
            href="/scan"
            className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            View all →
          </a>
        </div>
      </CardHeader>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-zinc-800 rounded" />)}
        </div>
      ) : newResults.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-zinc-500 mb-2">No new scan results.</p>
          <a
            href="/scan"
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors inline-block"
          >
            Run Scan
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {newResults.map((r) => {
            const dir = r.aiAnalysis?.suggestedDirection ?? "watch";
            return (
              <a
                key={(r._id as unknown as { toString(): string }).toString()}
                href={`/dashboard?symbol=${r.symbol}`}
                className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 hover:bg-zinc-800/20 px-1 rounded group transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-white">{r.symbol}</span>
                  <span className="ml-2 text-xs text-zinc-500">{r.sector}</span>
                </div>
                <span className={`text-xs font-semibold ${DIRECTION_COLOR[dir]}`}>
                  {dir.toUpperCase()}
                </span>
              </a>
            );
          })}
          {data && data.results.filter((r) => r.status === "new").length > 5 && (
            <p className="text-xs text-zinc-500 text-center pt-1">
              +{data.results.filter((r) => r.status === "new").length - 5} more →{" "}
              <a href="/scan" className="text-yellow-400 hover:underline">view all</a>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
