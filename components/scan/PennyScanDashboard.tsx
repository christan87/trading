"use client";

import { useEffect, useState, useCallback } from "react";
import type { ScanResult } from "@/lib/db/models";
import { ScanResultCard } from "./ScanResultCard";

interface RunMeta {
  scanId: string;
  scannedAt: string;
  count: number;
}

interface PennyData {
  results: ScanResult[];
  recentRuns: RunMeta[];
  scansRemainingToday: number;
}

const REMAINING_COLORS = (n: number) =>
  n >= 4 ? "text-emerald-400" : n >= 2 ? "text-yellow-400" : "text-red-400";

function PennyRiskWarning() {
  return (
    <div className="bg-red-950 border border-red-800 rounded-xl p-4">
      <p className="text-sm font-semibold text-red-400 mb-1">Penny stocks carry significantly higher risk of loss.</p>
      <p className="text-xs text-red-400/80">
        Penny stocks are priced $0.10–$5.00 and trade on NASDAQ/NYSE with average daily volume above 500,000 shares.
        They are subject to extreme volatility, thin liquidity, wide bid-ask spreads, and potential manipulation.
        Maximum position size is automatically limited to 2% of portfolio value.
        All penny stock recommendations carry a minimum risk score of 6/10.
        This is not investment advice.
      </p>
    </div>
  );
}

function PennyScanCard({ result, onStatusChange }: { result: ScanResult; onStatusChange: (id: string, status: ScanResult["status"]) => void }) {
  const det = result.pennyStockDetails;
  const id = (result._id as unknown as { toString(): string }).toString();

  return (
    <div className="space-y-0">
      {det && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-t-xl px-4 pt-3 pb-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-zinc-600">1d / 5d / 20d</p>
            <p className={det.priceChange5d >= 0 ? "text-emerald-400" : "text-red-400"}>
              {det.priceChange1d.toFixed(1)}% / {det.priceChange5d.toFixed(1)}% / {det.priceChange20d.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-zinc-600">Vol spike</p>
            <p className={det.volumeSpike >= 2 ? "text-yellow-400" : "text-zinc-300"}>
              {det.volumeSpike.toFixed(1)}x
            </p>
          </div>
          <div>
            <p className="text-zinc-600">Exchange</p>
            <p className="text-zinc-300">{det.exchange}</p>
          </div>
        </div>
      )}
      <div className={det ? "border-t-0 [&>div]:rounded-t-none" : ""}>
        <ScanResultCard result={result} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
}

export function PennyScanDashboard() {
  const [data, setData] = useState<PennyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchangeFilter, setExchangeFilter] = useState<"all" | "NASDAQ" | "NYSE">("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/penny");
      if (res.ok) {
        setData(await res.json());
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

  useEffect(() => {
    load();
  }, [load]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/scan/penny/trigger", { method: "POST" });
      const body = await res.json();
      if (res.ok) {
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
          (r._id as unknown as { toString(): string }).toString() === id ? { ...r, status } : r
        ),
      };
    });
  };

  const filtered = (data?.results ?? []).filter((r) => {
    if (exchangeFilter === "all") return true;
    return r.pennyStockDetails?.exchange === exchangeFilter;
  });

  return (
    <div className="space-y-4">
      <PennyRiskWarning />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Penny Stock Scanner</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            NASDAQ/NYSE equities $0.10–$5.00 · min 500K avg daily volume
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className={`text-xs ${REMAINING_COLORS(data.scansRemainingToday ?? 0)}`}>
              {data.scansRemainingToday ?? 0} scans remaining today
            </span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning || loading || (data?.scansRemainingToday ?? 1) === 0}
            className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {scanning ? "Scanning…" : "Run Penny Scan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
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

      {/* Scan signal description */}
      <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400">
        Penny scans detect: volume spikes (today {">"}  2x 20-day avg), price momentum (1d/5d/20d), insider buying activity, sector momentum, and news sentiment. Risk score minimum is 6/10. Max position: 2% of portfolio.
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-52 bg-zinc-800 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm">
            {data?.results.length === 0
              ? 'No penny stock results yet. Click "Run Penny Scan" to start.'
              : "No results match the current filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((result) => (
            <PennyScanCard
              key={(result._id as unknown as { toString(): string }).toString()}
              result={result}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {data?.recentRuns && data.recentRuns.length > 1 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Penny Scan History</h2>
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
