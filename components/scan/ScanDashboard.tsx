"use client";

import { useEffect, useState, useCallback } from "react";
import type { ScanResult } from "@/lib/db/models";
import { ScanResultCard } from "./ScanResultCard";
import { ScanFilters, applyFilters, DEFAULT_SCAN_FILTERS, type ScanFilterState } from "./ScanFilters";
import { RejectionAccuracy } from "./RejectionAccuracy";

interface RunMeta {
  scanId: string;
  scannedAt: string;
  count: number;
}

interface ScanData {
  results: ScanResult[];
  recentRuns: RunMeta[];
  scansRemainingToday: number;
}

const REMAINING_COLORS = (n: number) =>
  n >= 4 ? "text-emerald-400" : n >= 2 ? "text-yellow-400" : "text-red-400";

export function ScanDashboard() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filters, setFilters] = useState<ScanFilterState>(DEFAULT_SCAN_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [buyingPower, setBuyingPower] = useState<number | undefined>(undefined);

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
    fetch("/api/alpaca/account")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.buying_power) setBuyingPower(parseFloat(d.buying_power)); })
      .catch(() => undefined);
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
  const filtered = applyFilters(data?.results ?? [], filters, buyingPower);

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
        <div className="flex items-center gap-3">
          {data && (
            <span className={`text-xs ${REMAINING_COLORS(data.scansRemainingToday ?? 0)}`}>
              {data.scansRemainingToday ?? 0}/6 scans remaining today
            </span>
          )}
          <button
            onClick={handleTriggerScan}
            disabled={scanning || loading || (data?.scansRemainingToday ?? 1) === 0}
            className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {scanning ? "Scanning…" : "Run Scan"}
          </button>
        </div>
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
      <ScanFilters filters={filters} sectors={sectors} buyingPower={buyingPower} onChange={setFilters} />

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

      {/* Filter accuracy */}
      <RejectionAccuracy />

      {/* Run history */}
      {data?.recentRuns && data.recentRuns.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Scan History</h2>
          <div className="space-y-1">
            {data.recentRuns.map((run) => (
              <div
                key={run.scanId}
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
