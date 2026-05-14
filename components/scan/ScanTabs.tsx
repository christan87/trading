"use client";

import { useState } from "react";
import { ScanDashboard } from "./ScanDashboard";
import { OptionsScanDashboard } from "./OptionsScanDashboard";
import { PennyScanDashboard } from "./PennyScanDashboard";

type Tab = "equity" | "options" | "penny";

const TABS: { id: Tab; label: string }[] = [
  { id: "equity", label: "Market Scan" },
  { id: "options", label: "Options Scan" },
  { id: "penny", label: "Penny Stocks" },
];

export function ScanTabs() {
  const [active, setActive] = useState<Tab>("equity");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              active === tab.id
                ? "bg-yellow-500 text-black"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "equity" && <ScanDashboard />}
      {active === "options" && <OptionsScanDashboard />}
      {active === "penny" && <PennyScanDashboard />}
    </div>
  );
}
