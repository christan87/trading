"use client";

import { useEffect, useState } from "react";
import { QuoteCard } from "./QuoteCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

export function WatchList() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/alpaca/watchlist")
      .then((r) => r.json())
      .then((d) => setSymbols(d.watchlist ?? []));
  }, []);

  const add = async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker || symbols.includes(ticker)) return;
    setAdding(true);
    await fetch("/api/alpaca/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: ticker }),
    });
    setSymbols((prev) => [...prev, ticker]);
    setInput("");
    setAdding(false);
  };

  const remove = async (symbol: string) => {
    await fetch("/api/alpaca/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    setSymbols((prev) => prev.filter((s) => s !== symbol));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Watchlist</CardTitle>
          <form
            onSubmit={(e) => { e.preventDefault(); add(); }}
            className="flex gap-2"
          >
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
      {symbols.length === 0 ? (
        <p className="text-sm text-zinc-500">Add tickers above to start watching.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {symbols.map((s) => (
            <QuoteCard key={s} symbol={s} onRemove={remove} />
          ))}
        </div>
      )}
    </Card>
  );
}
