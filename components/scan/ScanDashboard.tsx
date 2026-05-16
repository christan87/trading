"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult } from "@/lib/db/models";
import { UnifiedScanCard } from "./unified-scan-card";
import { ScanProgressBar } from "./scan-progress-bar";
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

// Thin wrapper that fades a card in from opacity-0 on mount.
// Only applied to cards that arrived via SSE during a live scan.
function FadeInCard({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms ease-out" }}>
      {children}
    </div>
  );
}

export function ScanDashboard() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScanFilterState>(DEFAULT_SCAN_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [buyingPower, setBuyingPower] = useState<number | undefined>(undefined);
  // Results that arrived via SSE before the full DB reload
  const [streamedResults, setStreamedResults] = useState<ScanResult[]>([]);
  // IDs of cards that should animate in (just arrived via SSE)
  const newResultIds = useRef<Set<string>>(new Set());
  // Rejected count from SSE rejection events during the current scan
  const [liveRejectedCount, setLiveRejectedCount] = useState(0);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan");
      if (res.ok) {
        const d = await res.json() as ScanData;
        setData(d);
        setStreamedResults([]);
        newResultIds.current.clear();
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
    const scanId = crypto.randomUUID();
    setScanning(true);
    setActiveScanId(scanId);
    setStreamedResults([]);
    setLiveRejectedCount(0);
    newResultIds.current.clear();
    setError(null);

    try {
      const res = await fetch("/api/scan/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      if (res.ok) {
        await load();
      } else {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Scan failed.");
      }
    } catch {
      setError("Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const handleStreamedResult = useCallback((result: ScanResult) => {
    const id = (result._id as unknown as { toString(): string }).toString();
    newResultIds.current.add(id);
    setStreamedResults((prev) => {
      const key = `${result.scanId}:${result.symbol}`;
      if (prev.some((r) => `${r.scanId}:${r.symbol}` === key)) return prev;
      return [result, ...prev];
    });
  }, []);

  const handleRejection = useCallback(() => {
    setLiveRejectedCount((n) => n + 1);
  }, []);

  const handleScanDone = useCallback(() => {
    doneTimerRef.current = setTimeout(() => {
      if (doneTimerRef.current) {
        setActiveScanId(null);
        setLiveRejectedCount(0);
      }
    }, 100);
  }, []);

  useEffect(() => () => {
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
  }, []);

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

  // Show streamed SSE results merged with DB results until load() clears them.
  // load() resets streamedResults to [] so data.results becomes the sole source of truth.
  const allResults = streamedResults.length > 0
    ? [
        ...streamedResults,
        ...(data?.results ?? []).filter((r) => {
          const key = `${r.scanId}:${r.symbol}`;
          return !streamedResults.some((s) => `${s.scanId}:${s.symbol}` === key);
        }),
      ]
    : (data?.results ?? []);

  const sectors = [...new Set(allResults.map((r) => r.sector))].sort();
  const filtered = applyFilters(allResults, filters, buyingPower);
  const lastRun = data?.recentRuns?.[0];

  return (
    <div className="space-y-4">
      {/* Header */}
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
          {/* Rejected counter badge — visible only during an active scan */}
          {scanning && liveRejectedCount > 0 && (
            <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full tabular-nums">
              {liveRejectedCount} rejected
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

      {/* Progress bar — only visible while scan is active */}
      {activeScanId && (
        <ScanProgressBar
          scanId={activeScanId}
          onResult={handleStreamedResult}
          onRejection={handleRejection}
          onDone={handleScanDone}
        />
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400">
        Scans are event-driven: they analyze recent political, regulatory, and congressional news to surface S&P 500 stocks worth investigating. Results are not buy/sell recommendations.
      </div>

      <ScanFilters filters={filters} sectors={sectors} buyingPower={buyingPower} onChange={setFilters} />

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm">
            {allResults.length === 0
              ? 'No scan results yet. Click "Run Scan" to discover opportunities.'
              : "No results match the current filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((result) => {
            const id = (result._id as unknown as { toString(): string }).toString();
            const isNew = newResultIds.current.has(id);
            const card = (
              <UnifiedScanCard
                key={id}
                mode="scan"
                data={result}
                onStatusChange={handleStatusChange}
              />
            );
            return isNew ? (
              <FadeInCard key={id}>{card}</FadeInCard>
            ) : (
              <div key={id}>{card}</div>
            );
          })}
        </div>
      )}

      <RejectionAccuracy />

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
