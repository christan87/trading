"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

interface Props {
  traderId: string;
  config: {
    virtualBalance: number;
    targetRoiPct: number;
    maxPositionSizePct: number;
    isActive: boolean;
  };
  onSaved: () => void;
}

export function TraderSettings({ traderId, config, onSaved }: Props) {
  const [targetRoi, setTargetRoi] = useState(String(config.targetRoiPct));
  const [maxPos, setMaxPos] = useState(String(config.maxPositionSizePct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/virtual-trader/${traderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRoiPct: parseFloat(targetRoi),
          maxPositionSizePct: parseFloat(maxPos),
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Save failed");
        return;
      }
      onSaved();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <p className="text-sm font-semibold text-zinc-300 mb-3">Trader Settings</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Virtual Balance</label>
          <p className="text-sm text-zinc-300">${config.virtualBalance.toLocaleString()} (fixed at creation)</p>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Monthly ROI Target (%)</label>
          <input
            type="number"
            min={1}
            max={50}
            value={targetRoi}
            onChange={(e) => setTargetRoi(e.target.value)}
            className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Position Size (%)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxPos}
            onChange={(e) => setMaxPos(e.target.value)}
            className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-zinc-500"
          />
          <p className="text-xs text-zinc-600 mt-1">Max 10% per position</p>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}
