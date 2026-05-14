"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface StrategyVersion {
  versionNumber: number;
  peakRoiPct: number;
  avgRoiPct: number;
  activeFrom: string;
  activeTo: string;
  updateReason: string;
  performance: {
    wins: number;
    losses: number;
    winRate: number;
  };
}

interface StrategyDoc {
  _id: string;
  type: string;
  name: string;
  currentVersion: number;
  versions: StrategyVersion[];
}

function fmt(dt: string) {
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function VersionRow({
  version,
  strategyType,
  onRevert,
}: {
  version: StrategyVersion;
  strategyType: string;
  onRevert: (versionNumber: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 flex-1">
          <p className="text-xs font-medium text-zinc-300">
            v{version.versionNumber} · {fmt(version.activeFrom)} – {fmt(version.activeTo)}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{version.updateReason}</p>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          <p className={`text-xs font-semibold ${version.avgRoiPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            avg {pct(version.avgRoiPct)}
          </p>
          <p className="text-xs text-zinc-500">
            peak {pct(version.peakRoiPct)} · {version.performance.wins}W/{version.performance.losses}L
          </p>
        </div>
      </div>

      {confirming ? (
        <div className="space-y-2 pt-1">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for reverting…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (reason.trim()) {
                  onRevert(version.versionNumber);
                  setConfirming(false);
                }
              }}
              disabled={!reason.trim()}
              className="text-xs bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-semibold px-3 py-1 rounded transition-colors"
            >
              Confirm revert
            </button>
            <button
              onClick={() => { setConfirming(false); setReason(""); }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Revert to v{version.versionNumber} →
        </button>
      )}
    </div>
  );
}

function StrategyVersionCard({ strategy }: { strategy: StrategyDoc }) {
  const [open, setOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState("");

  const versions = (strategy.versions ?? []).slice().reverse();

  const handleRevert = async (versionNumber: number) => {
    const reason = `User revert from UI`; // caller sets; already prompted in VersionRow
    setReverting(true);
    setError("");
    try {
      const res = await fetch(`/api/strategies/${strategy.type}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber, reason }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Revert failed");
      }
    } catch {
      setError("Revert failed");
    } finally {
      setReverting(false);
    }
  };

  if (versions.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div>
          <span className="text-sm font-medium text-zinc-200">{strategy.name}</span>
          <span className="ml-2 text-xs text-zinc-500">v{strategy.currentVersion ?? 1} current · {versions.length} previous</span>
        </div>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {reverting && <p className="text-xs text-zinc-400">Reverting…</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {versions.map((v) => (
            <VersionRow
              key={v.versionNumber}
              version={v}
              strategyType={strategy.type}
              onRevert={handleRevert}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function VersionHistory() {
  const [strategies, setStrategies] = useState<StrategyDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/strategies/list")
      .then((r) => r.json())
      .then((d) => setStrategies(Array.isArray(d) ? d.filter((s: StrategyDoc) => (s.versions ?? []).length > 0) : []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const withHistory = strategies.filter((s) => (s.versions ?? []).length > 0);

  if (loading) return null;
  if (withHistory.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Version History</CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {withHistory.map((s) => (
          <StrategyVersionCard key={s._id} strategy={s} />
        ))}
      </div>
    </Card>
  );
}
