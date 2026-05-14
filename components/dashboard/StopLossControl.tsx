"use client";

import { useEffect, useState } from "react";
import type { StopLoss } from "@/lib/db/models";

interface Props {
  positionId: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
}

export function StopLossControl({ positionId, symbol, entryPrice, currentPrice }: Props) {
  const [active, setActive] = useState<StopLoss | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"fixed" | "trailing">("trailing");
  const [threshold, setThreshold] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadActive = async () => {
    const res = await fetch("/api/stop-losses");
    if (res.ok) {
      const all = await res.json() as StopLoss[];
      const match = all.find((s) => s.positionId === positionId && s.status === "active") ?? null;
      setActive(match);
    }
  };

  useEffect(() => { loadActive(); }, [positionId]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/stop-losses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId,
          symbol,
          type,
          percentageThreshold: parseFloat(threshold),
          entryPrice,
        }),
      });
      const data = await res.json() as { error?: string } & StopLoss;
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setActive(data);
      setShowForm(false);
    } catch {
      setError("Failed to set stop-loss");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!active) return;
    const id = (active._id as unknown as { toString(): string }).toString();
    await fetch(`/api/stop-losses/${id}`, { method: "DELETE" });
    setActive(null);
  };

  const triggerPct = parseFloat(threshold);
  const previewTrigger = isNaN(triggerPct) ? null : entryPrice * (1 - triggerPct / 100);
  const distancePct = active
    ? ((currentPrice - active.triggerPrice) / active.triggerPrice) * 100
    : null;

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800">
      {active ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">
              {active.type === "trailing" ? "Trailing" : "Fixed"} stop-loss active
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="flex gap-4 text-xs">
            <div>
              <p className="text-zinc-600">Trigger</p>
              <p className="text-red-400 font-medium">${active.triggerPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-zinc-600">Anchor</p>
              <p className="text-zinc-300">${active.anchorPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-zinc-600">Threshold</p>
              <p className="text-zinc-300">{active.percentageThreshold}%</p>
            </div>
          </div>
          {distancePct !== null && (
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, 100 - distancePct))}%` }}
                title={`${distancePct.toFixed(1)}% above trigger`}
              />
            </div>
          )}
          <button
            onClick={handleCancel}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Cancel stop-loss
          </button>
        </div>
      ) : (
        !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + Set stop-loss
          </button>
        )
      )}

      {showForm && (
        <div className="space-y-3 mt-2">
          <div className="flex gap-2">
            <button
              onClick={() => setType("trailing")}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${type === "trailing" ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500"}`}
            >
              Trailing
            </button>
            <button
              onClick={() => setType("fixed")}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${type === "fixed" ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500"}`}
            >
              Fixed
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Threshold %</label>
            <input
              type="number"
              min={1}
              max={99}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none"
            />
          </div>
          {previewTrigger && (
            <p className="text-xs text-zinc-500">
              Trigger at: <span className="text-red-400">${previewTrigger.toFixed(2)}</span>
              {type === "trailing" && " (will move up as price rises)"}
            </p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Set"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
