"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { WatchlistItem } from "@/lib/db/models";

interface EntryTimingResult {
  symbol: string;
  currentPrice: number;
  rsi: number;
  result: { assessment: string; confidence: number; signal: "favorable" | "neutral" | "unfavorable" } | null;
  remainingToday: number;
}

interface WatchlistItemEx extends WatchlistItem {
  currentPrice?: number;
  changePct?: number;
}

function signalColor(signal: string) {
  return signal === "favorable" ? "text-emerald-400" : signal === "unfavorable" ? "text-red-400" : "text-yellow-400";
}

function pnlColor(v: number) {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-400";
}

export function WatchList() {
  const [items, setItems] = useState<WatchlistItemEx[]>([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [timing, setTiming] = useState<Record<string, EntryTimingResult | "loading" | "error">>({});
  const [remainingTimingToday, setRemainingTimingToday] = useState<number>(10);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch("/api/alpaca/watchlist");
    if (!res.ok) return;
    const data = await res.json() as { watchlist: WatchlistItem[] };
    setItems(data.watchlist);

    // Fetch live prices for each symbol via SSE quote endpoint (best-effort)
    for (const item of data.watchlist) {
      fetch(`/api/market/quotes?symbols=${item.symbol}`)
        .then(() => undefined)
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const add = async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    setAdding(true);
    await fetch("/api/alpaca/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: ticker }),
    });
    await loadWatchlist();
    setInput("");
    setAdding(false);
  };

  const remove = async (symbol: string) => {
    await fetch("/api/alpaca/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
  };

  const checkEntryTiming = async (symbol: string) => {
    setTiming((prev) => ({ ...prev, [symbol]: "loading" }));
    try {
      const res = await fetch("/api/alpaca/watchlist/entry-timing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json() as EntryTimingResult & { error?: string };
      if (!res.ok) {
        setTiming((prev) => ({ ...prev, [symbol]: "error" }));
        return;
      }
      setTiming((prev) => ({ ...prev, [symbol]: data }));
      setRemainingTimingToday(data.remainingToday);
    } catch {
      setTiming((prev) => ({ ...prev, [symbol]: "error" }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Watchlist</CardTitle>
          <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="Add ticker…"
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-500 w-24 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white px-2 py-1 rounded"
            >
              Add
            </button>
          </form>
        </div>
      </CardHeader>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Add tickers above to start watching.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const addedPrice = item.priceWhenAdded;
            const currentPrice = item.currentPrice;
            const hypotheticalPnlPct =
              addedPrice && currentPrice && addedPrice > 0
                ? ((currentPrice - addedPrice) / addedPrice) * 100
                : null;
            const timingEntry = timing[item.symbol];

            return (
              <div key={item.symbol} className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{item.symbol}</span>
                      {currentPrice && (
                        <span className="text-sm text-zinc-200">${currentPrice.toFixed(2)}</span>
                      )}
                      {item.changePct !== undefined && (
                        <span className={`text-xs ${pnlColor(item.changePct)}`}>
                          {item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    {addedPrice > 0 && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Added at ${addedPrice.toFixed(2)}
                        {hypotheticalPnlPct !== null && (
                          <span className={`ml-2 font-medium ${pnlColor(hypotheticalPnlPct)}`}>
                            ({hypotheticalPnlPct >= 0 ? "+" : ""}{hypotheticalPnlPct.toFixed(2)}% hypothetical)
                          </span>
                        )}
                      </p>
                    )}
                    {item.notes && <p className="text-xs text-zinc-500 mt-0.5 italic">{item.notes}</p>}
                  </div>
                  <button onClick={() => remove(item.symbol)} className="text-zinc-600 hover:text-zinc-400 text-xs">
                    ✕
                  </button>
                </div>

                {timingEntry && timingEntry !== "loading" && timingEntry !== "error" && (
                  <div className="bg-zinc-900 rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-semibold ${signalColor(timingEntry.result?.signal ?? "neutral")}`}>
                        {(timingEntry.result?.signal ?? "N/A").toUpperCase()} · {timingEntry.result?.confidence ?? 0}% confidence
                      </p>
                      <p className="text-xs text-zinc-600">RSI {timingEntry.rsi}</p>
                    </div>
                    {timingEntry.result?.assessment && (
                      <p className="text-xs text-zinc-400 leading-relaxed">{timingEntry.result.assessment}</p>
                    )}
                  </div>
                )}
                {timingEntry === "error" && <p className="text-xs text-red-400">Analysis failed.</p>}

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => checkEntryTiming(item.symbol)}
                    disabled={timingEntry === "loading" || remainingTimingToday === 0}
                    className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-300 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    {timingEntry === "loading" ? "Analyzing…" : "Check entry timing"}
                  </button>
                  <a
                    href={`/strategy?symbol=${item.symbol}`}
                    className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Full analysis
                  </a>
                </div>

                {item.addedAt && new Date(item.addedAt).getTime() > 0 && (
                  <p className="text-[10px] text-zinc-700">
                    Added {new Date(item.addedAt).toLocaleDateString()}
                    {item.sourceScanId && " · from scan"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {remainingTimingToday < 10 && (
        <p className="text-xs text-zinc-600 mt-2">{remainingTimingToday} entry timing checks remaining today</p>
      )}
    </Card>
  );
}
