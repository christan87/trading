"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ScanResult, PennyRejectedCandidate } from "@/lib/db/models";
import { UnifiedScanCard } from "./unified-scan-card";
import { ScanProgressBar } from "./scan-progress-bar";

interface RunMeta {
  scanId: string;
  scannedAt: string;
  count: number;
}

interface PennyData {
  results: ScanResult[];
  rejected: PennyRejectedCandidate[];
  recentRuns: RunMeta[];
  scansRemainingToday: number;
}

interface LastScanStats {
  sampledCount?: number;
  priceFilteredCount?: number;
  volumeFilteredCount?: number;
  candidatesFound?: number;
}

interface ScanParams {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
}

// These are IEX venue volumes — penny stocks rarely trade on IEX so keep thresholds low.
// A stock with 500 IEX shares/day typically has 5K–50K total market volume.
const VOLUME_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "100+", value: 100 },
  { label: "500+", value: 500 },
  { label: "1K+", value: 1_000 },
  { label: "5K+", value: 5_000 },
];

const REMAINING_COLORS = (n: number) =>
  n >= 4 ? "text-emerald-400" : n >= 2 ? "text-yellow-400" : "text-red-400";

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

function PennyRiskWarning() {
  return (
    <div className="bg-red-950 border border-red-800 rounded-xl p-4">
      <p className="text-sm font-semibold text-red-400 mb-1">Penny stocks carry significantly higher risk of loss.</p>
      <p className="text-xs text-red-400/80">
        Subject to extreme volatility, thin liquidity, wide bid-ask spreads, and potential manipulation.
        Maximum position size is automatically limited to 2% of portfolio value.
        All penny stock recommendations carry a minimum risk score of 6/10.
        This is not investment advice.
      </p>
    </div>
  );
}

export function PennyScanDashboard() {
  const [data, setData] = useState<PennyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [streamedResults, setStreamedResults] = useState<ScanResult[]>([]);
  const newResultIds = useRef<Set<string>>(new Set());
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanStats, setLastScanStats] = useState<LastScanStats | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "rejected">("results");
  const [exchangeFilter, setExchangeFilter] = useState<"all" | "NASDAQ" | "NYSE">("all");

  // Scan parameter state
  const [params, setParams] = useState<ScanParams>({ minPrice: 0.10, maxPrice: 5.00, minVolume: 0 });
  const [paramsOpen, setParamsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/penny");
      if (res.ok) {
        setData(await res.json());
        setStreamedResults([]);
        newResultIds.current.clear();
        setError(null);
      } else {
        setError("Failed to load penny stock results.");
      }
    } catch {
      setError("Failed to load penny stock results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
  }, []);

  const handleStreamedResult = useCallback((result: ScanResult) => {
    const id = (result._id as unknown as { toString(): string }).toString();
    newResultIds.current.add(id);
    setStreamedResults((prev) => {
      const key = `${result.scanId}:${result.symbol}`;
      if (prev.some((r) => `${r.scanId}:${r.symbol}` === key)) return prev;
      return [result, ...prev];
    });
  }, []);

  const handleScanDone = useCallback(() => {
    doneTimerRef.current = setTimeout(() => {
      if (doneTimerRef.current) {
        setActiveScanId(null);
      }
    }, 100);
  }, []);

  const handleScan = async () => {
    const scanId = crypto.randomUUID();
    setScanning(true);
    setActiveScanId(scanId);
    setStreamedResults([]);
    newResultIds.current.clear();
    setError(null);
    try {
      const res = await fetch("/api/scan/penny/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, scanId }),
      });
      const body = await res.json();
      if (res.ok) {
        setLastScanStats({
          sampledCount: body.sampledCount,
          priceFilteredCount: body.priceFilteredCount,
          volumeFilteredCount: body.volumeFilteredCount,
          candidatesFound: body.candidatesFound,
        });
        await load();
        if (body.candidatesFound === 0) setActiveTab("rejected");
      } else {
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
          (r._id as unknown as { toString(): string }).toString() === id ? { ...r, status } : r
        ),
      };
    });
  };

  const allResults = streamedResults.length > 0
    ? [
        ...streamedResults,
        ...(data?.results ?? []).filter((r) => {
          const key = `${r.scanId}:${r.symbol}`;
          return !streamedResults.some((s) => `${s.scanId}:${s.symbol}` === key);
        }),
      ]
    : (data?.results ?? []);

  const filtered = allResults.filter((r) => {
    if (exchangeFilter === "all") return true;
    return r.pennyStockDetails?.exchange === exchangeFilter;
  });

  const rejected = data?.rejected ?? [];

  return (
    <div className="space-y-4">
      <PennyRiskWarning />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Penny Stock Scanner</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            NASDAQ/NYSE equities ${params.minPrice.toFixed(2)}–${params.maxPrice.toFixed(2)} · {params.minVolume === 0 ? "any IEX activity" : `min ${params.minVolume.toLocaleString()} IEX shares`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className={`text-xs ${REMAINING_COLORS(data.scansRemainingToday ?? 0)}`}>
              {data.scansRemainingToday ?? 0} scans remaining today
            </span>
          )}
          <button
            onClick={() => setParamsOpen((v) => !v)}
            className="text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 px-3 py-2 rounded-lg transition-colors"
          >
            Filters
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || loading || (data?.scansRemainingToday ?? 1) === 0}
            className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {scanning ? "Scanning…" : "Run Penny Scan"}
          </button>
        </div>
      </div>

      {/* Scan parameter controls */}
      {paramsOpen && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Scan Parameters</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Min Price ($)</label>
              <input
                type="number"
                min={0.01} max={params.maxPrice - 0.01} step={0.01}
                value={params.minPrice}
                onChange={(e) => setParams((p) => ({ ...p, minPrice: Math.max(0.01, parseFloat(e.target.value) || 0.01) }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Max Price ($)</label>
              <input
                type="number"
                min={params.minPrice + 0.01} max={50} step={0.50}
                value={params.maxPrice}
                onChange={(e) => setParams((p) => ({ ...p, maxPrice: Math.min(50, parseFloat(e.target.value) || 5) }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Min IEX Activity (shares)</label>
              <select
                value={params.minVolume}
                onChange={(e) => setParams((p) => ({ ...p, minVolume: parseInt(e.target.value) }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              >
                {VOLUME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-zinc-600">
            Penny stocks rarely trade on IEX (Alpaca&apos;s free data source), so IEX volume is much lower than total market volume.
            &ldquo;Any&rdquo; includes all stocks with an IEX price, even if no IEX shares traded today.
            These settings apply to the next scan only.
          </p>
        </div>
      )}

      {activeScanId && (
        <ScanProgressBar
          scanId={activeScanId}
          onResult={handleStreamedResult}
          onRejection={() => {}}
          onDone={handleScanDone}
        />
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {([
          { id: "results", label: `Candidates${data ? ` (${data.results.length})` : ""}` },
          { id: "rejected", label: `Rejected${data ? ` (${rejected.length})` : ""}` },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-sm px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-yellow-500 text-yellow-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "results" && (
        <>
          {/* Exchange filter */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-zinc-500">Exchange:</span>
            {(["all", "NASDAQ", "NYSE"] as const).map((ex) => (
              <button
                key={ex}
                onClick={() => setExchangeFilter(ex)}
                className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                  exchangeFilter === ex
                    ? "bg-zinc-700 border-zinc-600 text-white"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {ex === "all" ? "All" : ex}
              </button>
            ))}
          </div>

          <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400">
            Penny scans detect: volume spikes (&ge;1.5x avg), price momentum (1d/5d/20d), insider buying, and news sentiment. Risk score minimum 6/10. Max position: 2% of portfolio.
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => <div key={i} className="h-52 bg-zinc-800 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8">
              {data?.results.length === 0 && lastScanStats ? (
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 text-sm text-zinc-400 space-y-2">
                  <p className="font-semibold text-zinc-300">No qualifying penny stocks found.</p>
                  <p>
                    {(lastScanStats.sampledCount ?? 0).toLocaleString()} sampled &rarr; {lastScanStats.priceFilteredCount} with IEX data &rarr; {lastScanStats.volumeFilteredCount} passed price + IEX activity filter &rarr; <span className="text-yellow-400 font-semibold">0 passed momentum filters</span>.
                  </p>
                  <p className="text-zinc-500 text-xs">
                    Try widening the price range or setting IEX Activity to &ldquo;Any&rdquo; using the Filters button, then run again. View the <button onClick={() => setActiveTab("rejected")} className="underline hover:text-zinc-300">Rejected tab</button> to see stocks that were close.
                  </p>
                </div>
              ) : data?.results.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm">No penny stock results yet. Click &ldquo;Run Penny Scan&rdquo; to start.</p>
              ) : (
                <p className="text-center text-zinc-500 text-sm">No results match the current exchange filter.</p>
              )}
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
                return isNew ? <FadeInCard key={id}>{card}</FadeInCard> : <div key={id}>{card}</div>;
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "rejected" && (
        <div>
          {rejected.length === 0 ? (
            <p className="text-center py-10 text-zinc-500 text-sm">
              {lastScanStats ? "No rejected candidates from the last scan." : "Run a scan to see rejected stocks."}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {rejected.map((c) => (
                  <UnifiedScanCard
                    key={`${c.scanId}-${c.symbol}`}
                    mode="rejected_penny"
                    data={c}
                  />
                ))}
              </div>
              <p className="text-xs text-zinc-600">
                These {rejected.length} stocks passed price and volume filters but did not meet the activity or AI confidence thresholds. Lower the volume filter or widen the price range to find more candidates.
              </p>
            </div>
          )}
        </div>
      )}

      {data?.recentRuns && data.recentRuns.length > 1 && (
        <div className="mt-4">
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
