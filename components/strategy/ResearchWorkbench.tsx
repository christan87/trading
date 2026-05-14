"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { calculateTier1Risk, type Tier1Input } from "@/lib/services/risk-assessor";
import { RiskGauge } from "./RiskGauge";

const FACTORS = [
  { key: "priceTrend", label: "Price trend (vs 50-day SMA)", hint: "Is the stock above or below its 50-day moving average?" },
  { key: "volume", label: "Volume analysis", hint: "Is recent volume above average? Confirms moves." },
  { key: "rsi", label: "RSI level", hint: "RSI < 30 = oversold, > 70 = overbought." },
  { key: "earnings", label: "Earnings proximity", hint: "Any earnings within 5 days? Adds volatility risk." },
  { key: "newsSentiment", label: "News sentiment", hint: "Is recent news positive, negative, or neutral?" },
  { key: "sectorMomentum", label: "Sector momentum", hint: "Is the sector outperforming or underperforming SPY?" },
  { key: "vix", label: "VIX level", hint: "VIX > 25 = elevated volatility environment." },
  { key: "congressActivity", label: "Congressional activity", hint: "Any recent buys or sells by Congress members?" },
];

const DATA_SOURCES = [
  { label: "Alpaca Market Data", desc: "Prices, bars, options chain" },
  { label: "Finnhub News", desc: "Company news, sentiment, congress trades" },
  { label: "FRED Macro Data", desc: "VIX, Fed Funds Rate, CPI, 10Y Treasury" },
  { label: "Congressional Trades", desc: "Member disclosures via STOCK Act" },
];

export function ResearchWorkbench() {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tier1, setTier1] = useState<ReturnType<typeof calculateTier1Risk> | null>(null);

  // Tier 1 form state
  const [t1, setT1] = useState<Partial<Tier1Input>>({
    assetType: "equity",
    vix: 18,
    avgDailyVolume: 5_000_000,
    positionSizePct: 3,
    tradingWithTrend: true,
    earningsInDays: null,
  });

  const toggle = (key: string) =>
    setChecklist((c) => ({ ...c, [key]: !c[key] }));

  const runTier1 = () => {
    const input: Tier1Input = {
      symbol: "",
      assetType: t1.assetType ?? "equity",
      vix: t1.vix ?? 18,
      avgDailyVolume: t1.avgDailyVolume ?? 1_000_000,
      positionSizePct: t1.positionSizePct ?? 3,
      tradingWithTrend: t1.tradingWithTrend ?? true,
      earningsInDays: t1.earningsInDays ?? null,
      daysToExpiration: t1.daysToExpiration,
    };
    setTier1(calculateTier1Risk(input));
  };

  const checkedCount = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Data sources */}
      <Card>
        <CardHeader><CardTitle>Data Sources</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-3">
          {DATA_SOURCES.map((s) => (
            <div key={s.label} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-zinc-300 font-medium">{s.label}</p>
                <p className="text-xs text-zinc-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Evaluation checklist */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Evaluation Checklist</CardTitle>
            <span className="text-xs text-zinc-500">{checkedCount} / {FACTORS.length} reviewed</span>
          </div>
        </CardHeader>
        <div className="space-y-3">
          {FACTORS.map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggle(f.key)}
                  className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    checklist[f.key]
                      ? "bg-yellow-500 border-yellow-500"
                      : "border-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {checklist[f.key] && <span className="text-black text-xs font-bold">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300">{f.label}</p>
                  <p className="text-xs text-zinc-500">{f.hint}</p>
                  <input
                    value={notes[f.key] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [f.key]: e.target.value }))}
                    placeholder="Your notes…"
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tier 1 risk calculator */}
      <Card>
        <CardHeader><CardTitle>Best Practices Risk Calculator (Tier 1 — Rules Only)</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Asset type</label>
            <select
              value={t1.assetType}
              onChange={(e) => setT1((s) => ({ ...s, assetType: e.target.value as "equity" | "option" }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs"
            >
              <option value="equity">Equity</option>
              <option value="option">Option</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">VIX level</label>
            <input
              type="number"
              value={t1.vix}
              onChange={(e) => setT1((s) => ({ ...s, vix: parseFloat(e.target.value) }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Avg daily volume</label>
            <input
              type="number"
              value={t1.avgDailyVolume}
              onChange={(e) => setT1((s) => ({ ...s, avgDailyVolume: parseInt(e.target.value) }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Position size (%)</label>
            <input
              type="number"
              value={t1.positionSizePct}
              onChange={(e) => setT1((s) => ({ ...s, positionSizePct: parseFloat(e.target.value) }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Earnings in days (blank = unknown)</label>
            <input
              type="number"
              value={t1.earningsInDays ?? ""}
              onChange={(e) => setT1((s) => ({ ...s, earningsInDays: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="none"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs"
            />
          </div>
          {t1.assetType === "option" && (
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Days to expiration</label>
              <input
                type="number"
                value={t1.daysToExpiration ?? ""}
                onChange={(e) => setT1((s) => ({ ...s, daysToExpiration: parseInt(e.target.value) }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs"
              />
            </div>
          )}
          <div className="flex items-center gap-2 col-span-2">
            <input
              type="checkbox"
              id="trend"
              checked={t1.tradingWithTrend}
              onChange={(e) => setT1((s) => ({ ...s, tradingWithTrend: e.target.checked }))}
              className="accent-yellow-400"
            />
            <label htmlFor="trend" className="text-xs text-zinc-300">Trading with 50-day SMA trend</label>
          </div>
        </div>

        <button
          onClick={runTier1}
          className="w-full bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium py-2 rounded-lg mb-4"
        >
          Calculate Risk
        </button>

        {tier1 && (
          <div className="space-y-3">
            <RiskGauge
              score={tier1.score}
              label={tier1.score <= 3 ? "low" : tier1.score <= 5 ? "moderate" : tier1.score <= 7 ? "high" : "very_high"}
              title="Tier 1 — Rules-Based Risk"
              availabilityNote="AI (Tier 2 & 3) unavailable — rules-based assessment only"
            />
            {tier1.factors.length > 0 && (
              <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                {tier1.factors.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
            <p className="text-xs text-zinc-600 italic">{tier1.methodology}</p>
          </div>
        )}
      </Card>

      <p className="text-xs text-zinc-600 italic text-center">
        This is an AI-generated analysis for informational purposes only. It is not investment advice.
      </p>
    </div>
  );
}
