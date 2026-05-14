"use client";

import { useEffect, useState, useCallback } from "react";
import type { ScanResult } from "@/lib/db/models";
import { ScanResultCard } from "./ScanResultCard";
import { ScanFilters, type ScanFilterState } from "./ScanFilters";

interface RunMeta {
  runId: string;
  scannedAt: string;
  count: number;
}

interface ScanData {
  results: ScanResult[];
  recentRuns: RunMeta[];
}

const DEFAULT_FILTERS: ScanFilterState = {
  triggerType: "all",
  direction: "all",
  status: "new",
  sector: "",
};

export function ScanDashboard() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filters, setFilters] = useState<ScanFilterState>(DEFAULT_FILTERS);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan");
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        setError("Failed to load scan results.");
      }
    } catch {
      setError("Failed to load scan results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleTriggerScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/scan/trigger", { method: "POST" });
      if (res.ok) {
        await load();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Scan failed.");
      }
    } catch {
      setError("Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const handleStatusChange = async (id: string, status: ScanResult["status"]) => {
    await fetch(`/api/scan/results/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        results: prev.results.map((r) =>
          (r._id as unknown as { toString(): string }).toString() === id
            ? { ...r, status }
            : r
        ),
      };
    });
  };

  const sectors = [...new Set((data?.results ?? []).map((r) => r.sector))].sort();

  const filtered = (data?.results ?? []).filter((r) => {
    if (filters.triggerType !== "all" && r.triggerType !== filters.triggerType) return false;
    if (filters.direction !== "all" && r.aiAnalysis?.suggestedDirection !== filters.direction) return false;
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.sector && r.sector !== filters.sector) return false;
    return true;
  });

  const lastRun = data?.recentRuns?.[0];

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Market Scan</h1>
          {lastRun && (
            <p className="text-xs text-zinc-500 mt-0.5">
              Last scan:{" "}
              {new Date(lastRun.scannedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {lastRun.count} candidates
            </p>
          )}
        </div>
        <button
          onClick={handleTriggerScan}
          disabled={scanning || loading}
          className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {scanning ? "Scanning…" : "Run Scan"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Scan notice */}
      <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400">
        Scans are event-driven: they analyze recent political, regulatory, and congressional news to surface S&P 500 stocks worth investigating. Results are not buy/sell recommendations.
      </div>

      {/* Filters */}
      <ScanFilters filters={filters} sectors={sectors} onChange={setFilters} />

      {/* Results */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm">
            {data?.results.length === 0
              ? 'No scan results yet. Click "Run Scan" to discover opportunities.'
              : "No results match the current filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((result) => (
            <ScanResultCard
              key={(result._id as unknown as { toString(): string }).toString()}
              result={result}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Run history */}
      {data?.recentRuns && data.recentRuns.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Scan History</h2>
          <div className="space-y-1">
            {data.recentRuns.map((run) => (
              <div
                key={run.runId}
                className="flex items-center justify-between text-xs text-zinc-500 py-1 border-b border-zinc-800"
              >
                <span>
                  {new Date(run.scannedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span>{run.count} candidates found</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
