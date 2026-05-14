"use client";

import type { ScanResult } from "@/lib/db/models";

export interface ScanFilterState {
  triggerType: ScanResult["triggerType"] | "all";
  direction: "long" | "short" | "watch" | "all";
  status: ScanResult["status"] | "all";
  sector: string;
  assetType: "all" | "equity" | "option" | "penny";
  minConfidence: number;
  maxConfidence: number;
  riskLevel: "all" | "low" | "moderate" | "high" | "very_high";
  minEntryPrice: string;
  maxEntryPrice: string;
  showOnlyRecommended: boolean;
  sortBy: "confidence" | "risk_asc" | "entry_price";
}

interface Props {
  filters: ScanFilterState;
  sectors: string[];
  buyingPower?: number;
  onChange: (f: ScanFilterState) => void;
}

export const DEFAULT_SCAN_FILTERS: ScanFilterState = {
  triggerType: "all",
  direction: "all",
  status: "new",
  sector: "",
  assetType: "all",
  minConfidence: 0,
  maxConfidence: 100,
  riskLevel: "all",
  minEntryPrice: "",
  maxEntryPrice: "",
  showOnlyRecommended: false,
  sortBy: "confidence",
};

const RISK_RANGES: Record<string, [number, number]> = {
  low: [1, 3],
  moderate: [4, 5],
  high: [6, 7],
  very_high: [8, 10],
};

export function applyFilters(results: ScanResult[], filters: ScanFilterState, buyingPower?: number): ScanResult[] {
  let out = results.filter((r) => {
    if (filters.triggerType !== "all" && r.triggerType !== filters.triggerType) return false;

    if (filters.direction !== "all") {
      const dirMap: Record<string, ScanResult["direction"]> = { long: "bullish", short: "bearish", watch: "neutral" };
      if (r.direction !== dirMap[filters.direction]) return false;
    }

    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.sector && r.sector !== filters.sector) return false;

    if (filters.assetType !== "all") {
      if (filters.assetType === "option" && !r.optionScanDetails) return false;
      if (filters.assetType === "penny" && !r.pennyStockDetails) return false;
      if (filters.assetType === "equity" && (r.optionScanDetails || r.pennyStockDetails)) return false;
    }

    const conf = r.aiAnalysis?.confidence ?? 0;
    if (conf < filters.minConfidence || conf > filters.maxConfidence) return false;

    if (filters.riskLevel !== "all") {
      const [lo, hi] = RISK_RANGES[filters.riskLevel];
      if (r.riskScore < lo || r.riskScore > hi) return false;
    }

    const entryPrice = r.entryRange?.currentPrice ?? 0;
    if (filters.minEntryPrice && entryPrice < parseFloat(filters.minEntryPrice)) return false;
    if (filters.maxEntryPrice && entryPrice > parseFloat(filters.maxEntryPrice)) return false;

    if (filters.showOnlyRecommended) {
      if (conf <= 60 || r.riskScore >= 7) return false;
    }

    if (buyingPower && buyingPower > 0 && entryPrice > 0) {
      if (entryPrice > buyingPower) return false;
    }

    return true;
  });

  if (filters.sortBy === "confidence") {
    out = out.sort((a, b) => (b.aiAnalysis?.confidence ?? 0) - (a.aiAnalysis?.confidence ?? 0));
  } else if (filters.sortBy === "risk_asc") {
    out = out.sort((a, b) => a.riskScore - b.riskScore);
  } else if (filters.sortBy === "entry_price") {
    out = out.sort((a, b) => (a.entryRange?.currentPrice ?? 0) - (b.entryRange?.currentPrice ?? 0));
  }

  return out;
}

export function ScanFilters({ filters, sectors, buyingPower, onChange }: Props) {
  const update = (patch: Partial<ScanFilterState>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.triggerType}
          onChange={(e) => update({ triggerType: e.target.value as ScanFilterState["triggerType"] })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="all">All triggers</option>
          <option value="political_event">Political</option>
          <option value="congress_trade">Congress</option>
          <option value="contract_award">Contract</option>
          <option value="regulatory">Regulatory</option>
          <option value="free_fall">Free-fall (Bearish)</option>
        </select>

        <select
          value={filters.direction}
          onChange={(e) => update({ direction: e.target.value as ScanFilterState["direction"] })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="all">All directions</option>
          <option value="long">Long / Bullish</option>
          <option value="short">Short / Bearish</option>
          <option value="watch">Watch</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value as ScanFilterState["status"] })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="new">New only</option>
          <option value="viewed">Viewed</option>
          <option value="promoted">Promoted</option>
          <option value="all">All statuses</option>
        </select>

        <select
          value={filters.sector}
          onChange={(e) => update({ sector: e.target.value })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filters.sortBy}
          onChange={(e) => update({ sortBy: e.target.value as ScanFilterState["sortBy"] })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="confidence">Sort: Confidence</option>
          <option value="risk_asc">Sort: Risk (low→high)</option>
          <option value="entry_price">Sort: Entry Price</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filters.assetType}
          onChange={(e) => update({ assetType: e.target.value as ScanFilterState["assetType"] })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="all">All asset types</option>
          <option value="equity">Equity</option>
          <option value="option">Options</option>
          <option value="penny">Penny stocks</option>
        </select>

        <select
          value={filters.riskLevel}
          onChange={(e) => update({ riskLevel: e.target.value as ScanFilterState["riskLevel"] })}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
        >
          <option value="all">All risk levels</option>
          <option value="low">Low (1–3)</option>
          <option value="moderate">Moderate (4–5)</option>
          <option value="high">High (6–7)</option>
          <option value="very_high">Very high (8–10)</option>
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Confidence:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={filters.minConfidence}
            onChange={(e) => update({ minConfidence: Number(e.target.value) })}
            className="w-14 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
          />
          <span className="text-xs text-zinc-600">–</span>
          <input
            type="number"
            min={0}
            max={100}
            value={filters.maxConfidence}
            onChange={(e) => update({ maxConfidence: Number(e.target.value) })}
            className="w-14 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Entry $:</span>
          <input
            type="number"
            min={0}
            value={filters.minEntryPrice}
            onChange={(e) => update({ minEntryPrice: e.target.value })}
            className="w-16 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
            placeholder="Min"
          />
          <span className="text-xs text-zinc-600">–</span>
          <input
            type="number"
            min={0}
            value={filters.maxEntryPrice}
            onChange={(e) => update({ maxEntryPrice: e.target.value })}
            className="w-16 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
            placeholder="Max"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showOnlyRecommended}
            onChange={(e) => update({ showOnlyRecommended: e.target.checked })}
            className="accent-yellow-500"
          />
          <span className="text-xs text-zinc-400">High-conviction only (confidence &gt; 60, risk &lt; 7)</span>
        </label>
        {buyingPower !== undefined && buyingPower > 0 && (
          <span className="text-xs text-zinc-500 ml-auto">
            Buying power: ${buyingPower.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
    </div>
  );
}
