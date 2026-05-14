"use client";

import type { ScanResult } from "@/lib/db/models";

export interface ScanFilterState {
  triggerType: ScanResult["triggerType"] | "all";
  direction: "long" | "short" | "watch" | "all";
  status: ScanResult["status"] | "all";
  sector: string;
}

interface Props {
  filters: ScanFilterState;
  sectors: string[];
  onChange: (f: ScanFilterState) => void;
}

export function ScanFilters({ filters, sectors, onChange }: Props) {
  const update = (patch: Partial<ScanFilterState>) => onChange({ ...filters, ...patch });

  return (
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
      </select>

      <select
        value={filters.direction}
        onChange={(e) => update({ direction: e.target.value as ScanFilterState["direction"] })}
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
      >
        <option value="all">All directions</option>
        <option value="long">Long</option>
        <option value="short">Short</option>
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
    </div>
  );
}
