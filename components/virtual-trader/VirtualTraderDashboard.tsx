"use client";

import { useState, useEffect, useCallback } from "react";
import { VirtualTraderCard } from "./VirtualTraderCard";
import { VirtualPositionsTable } from "./VirtualPositionsTable";
import { MonthlyReport } from "./MonthlyReport";
import { TraderSettings } from "./TraderSettings";
import { TraderComparison } from "./TraderComparison";
import { Card } from "@/components/ui/Card";
import type { VirtualTrader, VirtualPosition } from "@/lib/db/models";

interface TraderWithName extends VirtualTrader {
  strategyName: string;
}

interface Strategy {
  _id: string;
  name: string;
  type: string;
}

const DEFAULT_BALANCE = 10000;
const DEFAULT_ROI = 10;
const DEFAULT_MAX_POS = 5;

export function VirtualTraderDashboard() {
  const [traders, setTraders] = useState<TraderWithName[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positions, setPositions] = useState<VirtualPosition[]>([]);
  const [posTab, setPosTab] = useState<"open" | "closed">("open");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [createForm, setCreateForm] = useState({
    strategyId: "",
    virtualBalance: DEFAULT_BALANCE,
    targetRoiPct: DEFAULT_ROI,
    maxPositionSizePct: DEFAULT_MAX_POS,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadTraders = useCallback(async () => {
    try {
      const res = await fetch("/api/virtual-trader");
      if (res.ok) {
        const data = await res.json() as TraderWithName[];
        setTraders(data);
        if (data.length > 0 && !selectedId) {
          setSelectedId((data[0]._id as unknown as { toString(): string }).toString());
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadPositions = useCallback(async (id: string) => {
    const res = await fetch(`/api/virtual-trader/${id}/positions`);
    if (res.ok) setPositions(await res.json() as VirtualPosition[]);
  }, []);

  useEffect(() => {
    loadTraders();
    fetch("/api/strategies")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setStrategies(Array.isArray(d) ? d : []));
  }, [loadTraders]);

  useEffect(() => {
    if (selectedId) loadPositions(selectedId);
  }, [selectedId, loadPositions]);

  const selectedTrader = traders.find(
    (t) => (t._id as unknown as { toString(): string }).toString() === selectedId
  );

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await fetch(`/api/virtual-trader/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setTraders((prev) =>
      prev.map((t) =>
        (t._id as unknown as { toString(): string }).toString() === id
          ? { ...t, config: { ...t.config, isActive } }
          : t
      )
    );
  };

  const handleCreate = async () => {
    if (!createForm.strategyId) {
      setCreateError("Select a strategy");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/virtual-trader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json() as { error?: string } & TraderWithName;
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create");
        return;
      }
      setShowCreateForm(false);
      setCreateForm({ strategyId: "", virtualBalance: DEFAULT_BALANCE, targetRoiPct: DEFAULT_ROI, maxPositionSizePct: DEFAULT_MAX_POS });
      await loadTraders();
    } catch {
      setCreateError("Failed to create");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2].map((i) => <div key={i} className="h-40 bg-zinc-800 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Virtual Trader</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Autonomous strategy simulation — no real money involved
          </p>
        </div>
        {traders.length < 5 && (
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="text-sm bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {showCreateForm ? "Cancel" : "New Trader"}
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <p className="text-sm font-semibold text-zinc-300 mb-3">Create Virtual Trader</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Strategy</label>
              <select
                value={createForm.strategyId}
                onChange={(e) => setCreateForm((f) => ({ ...f, strategyId: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white w-full focus:outline-none"
              >
                <option value="">Select strategy…</option>
                {strategies.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Virtual Balance ($)</label>
                <input
                  type="number"
                  min={1000}
                  value={createForm.virtualBalance}
                  onChange={(e) => setCreateForm((f) => ({ ...f, virtualBalance: Number(e.target.value) }))}
                  className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Monthly ROI Target (%)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={createForm.targetRoiPct}
                  onChange={(e) => setCreateForm((f) => ({ ...f, targetRoiPct: Number(e.target.value) }))}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Max Position Size (%)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={createForm.maxPositionSizePct}
                  onChange={(e) => setCreateForm((f) => ({ ...f, maxPositionSizePct: Number(e.target.value) }))}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
                />
              </div>
            </div>
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </Card>
      )}

      {traders.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No virtual traders yet. Create one to start simulating a strategy autonomously.
          </p>
        </Card>
      ) : (
        <>
          {/* Trader cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {traders.map((t) => (
              <VirtualTraderCard
                key={(t._id as unknown as { toString(): string }).toString()}
                trader={t}
                onToggleActive={handleToggleActive}
                onSelect={setSelectedId}
                selected={(t._id as unknown as { toString(): string }).toString() === selectedId}
              />
            ))}
          </div>

          {/* Comparison (shown when 2+ traders) */}
          <TraderComparison traders={traders} />

          {/* Selected trader detail */}
          {selectedTrader && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-300">
                  {selectedTrader.strategyName} — Detail
                </p>
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showSettings ? "Hide Settings" : "Settings"}
                </button>
              </div>

              {showSettings && (
                <TraderSettings
                  traderId={selectedId!}
                  config={selectedTrader.config}
                  onSaved={() => { setShowSettings(false); loadTraders(); }}
                />
              )}

              <MonthlyReport monthlyReturns={selectedTrader.monthlyReturns} />

              <Card>
                <p className="text-sm font-semibold text-zinc-300 mb-3">Positions</p>
                <VirtualPositionsTable
                  positions={positions}
                  tab={posTab}
                  onTabChange={setPosTab}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
