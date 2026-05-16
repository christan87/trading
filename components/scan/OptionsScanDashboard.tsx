"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ScanResult } from "@/lib/db/models";
import type { OptionsScanParams, OptionsStrategyType } from "@/lib/services/options-scan";
import { UnifiedScanCard } from "./unified-scan-card";
import { ScanProgressBar } from "./scan-progress-bar";

interface RunMeta {
  scanId: string;
  scannedAt: string;
  count: number;
}

interface OptionsData {
  results: ScanResult[];
  recentRuns: RunMeta[];
  scansRemainingToday: number;
}

const STRATEGY_OPTIONS: { value: OptionsStrategyType; label: string; description: string }[] = [
  { value: "covered_call", label: "Covered Call", description: "Sell OTM calls against long stock" },
  { value: "cash_secured_put", label: "Cash-Secured Put", description: "Sell OTM puts with cash collateral" },
  { value: "bull_call_spread", label: "Bull Call Spread", description: "Buy lower strike call, sell higher strike call" },
  { value: "protective_put", label: "Protective Put", description: "Buy OTM put to protect long stock" },
];

const REMAINING_COLORS = (n: number) =>
  n >= 2 ? "text-emerald-400" : n >= 1 ? "text-yellow-400" : "text-red-400";

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

export function OptionsScanDashboard() {
  const [data, setData] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [streamedResults, setStreamedResults] = useState<ScanResult[]>([]);
  const newResultIds = useRef<Set<string>>(new Set());
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planLimited, setPlanLimited] = useState(false);

  const [params, setParams] = useState<OptionsScanParams>({
    strategyType: "covered_call",
    minOpenInterest: 100,
    maxDTE: 45,
    minIVPercentile: 0,
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/options");
      if (res.ok) {
        setData(await res.json());
        setStreamedResults([]);
        newResultIds.current.clear();
        setError(null);
      } else {
        setError("Failed to load options scan results.");
      }
    } catch {
      setError("Failed to load options scan results.");
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
      if (doneTimerRef.current) setActiveScanId(null);
    }, 100);
  }, []);

  const handleScan = async () => {
    const scanId = crypto.randomUUID();
    setScanning(true);
    setActiveScanId(scanId);
    setStreamedResults([]);
    newResultIds.current.clear();
    setError(null);
    setPlanLimited(false);
    try {
      const res = await fetch("/api/scan/options/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, scanId }),
      });
      const body = await res.json();
      if (res.ok) {
        if (body.planLimited) setPlanLimited(true);
        await load();
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
          (r._id as unknown as { toString(): string }).toString() === id
            ? { ...r, status }
            : r
        ),
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm font-semibold text-zinc-300">Options Scan Parameters</p>
          <div className="flex items-center gap-3">
            {data && (
              <span className={`text-xs ${REMAINING_COLORS(data.scansRemainingToday ?? 0)}`}>
                {data.scansRemainingToday ?? 0} options scans remaining today
              </span>
            )}
            <button
              onClick={handleScan}
              disabled={scanning || loading || (data?.scansRemainingToday ?? 1) === 0}
              className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {scanning ? "Scanning…" : (data?.scansRemainingToday ?? 1) === 0 ? "Daily limit reached" : "Run Options Scan"}
            </button>
          </div>
        </div>

        {activeScanId && (
          <ScanProgressBar
            scanId={activeScanId}
            onResult={handleStreamedResult}
            onRejection={() => {}}
            onDone={handleScanDone}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Strategy</label>
            <select
              value={params.strategyType}
              onChange={(e) => setParams((p) => ({ ...p, strategyType: e.target.value as OptionsStrategyType }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
            >
              {STRATEGY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-600 mt-0.5">
              {STRATEGY_OPTIONS.find((s) => s.value === params.strategyType)?.description}
            </p>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Min Open Interest</label>
            <input
              type="number"
              min={0}
              value={params.minOpenInterest}
              onChange={(e) => setParams((p) => ({ ...p, minOpenInterest: Number(e.target.value) }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Max DTE (days)</label>
            <input
              type="number"
              min={7}
              max={365}
              value={params.maxDTE}
              onChange={(e) => setParams((p) => ({ ...p, maxDTE: Number(e.target.value) }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Min IV Percentile</label>
            <input
              type="number"
              min={0}
              max={100}
              value={params.minIVPercentile}
              onChange={(e) => setParams((p) => ({ ...p, minIVPercentile: Number(e.target.value) }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
            />
            <p className="text-xs text-zinc-600 mt-0.5">0 = any IV (ignored if data unavailable)</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {planLimited && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 text-sm text-yellow-400">
          Options snapshot data (IV, bid/ask) unavailable on Alpaca Basic plan. Results scored on open interest, DTE, and underlying signals only. Upgrade to Algo Trader Plus for full options data.
        </div>
      )}

      <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400">
        Options scans search the top 20 S&P 500 stocks for contracts matching your parameters. Limited to 3 scans/day. Results are not buy/sell recommendations.
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      ) : (!data || data.results.length === 0) && streamedResults.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm">No options scan results yet. Configure parameters above and click Run Options Scan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {(() => {
            const allResults = streamedResults.length > 0
              ? [
                  ...streamedResults,
                  ...(data?.results ?? []).filter((r) => {
                    const key = `${r.scanId}:${r.symbol}`;
                    return !streamedResults.some((s) => `${s.scanId}:${s.symbol}` === key);
                  }),
                ]
              : (data?.results ?? []);
            return allResults.map((result) => {
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
            });
          })()}
        </div>
      )}

      {data?.recentRuns && data.recentRuns.length > 1 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Options Scan History</h2>
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
                <span>{run.count} contracts found</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
