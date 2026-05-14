"use client";

import { useEffect, useRef, useState } from "react";

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  source: string;
}

interface QuoteCardProps {
  symbol: string;
  onRemove?: (symbol: string) => void;
}

export function QuoteCard({ symbol, onRemove }: QuoteCardProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPrice = useRef<number | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/market/quotes?symbols=${symbol}`);

    es.onmessage = (e) => {
      const q: Quote = JSON.parse(e.data);
      if (q.symbol === symbol) {
        if (prevPrice.current !== null) {
          setFlash(q.price > prevPrice.current ? "up" : "down");
          setTimeout(() => setFlash(null), 400);
        }
        prevPrice.current = q.price;
        setQuote(q);
      }
    };

    return () => es.close();
  }, [symbol]);

  const isPositive = (quote?.changePct ?? 0) >= 0;

  const flashClass =
    flash === "up"
      ? "bg-emerald-900/30"
      : flash === "down"
      ? "bg-red-900/30"
      : "bg-zinc-900";

  return (
    <div
      className={`border border-zinc-800 rounded-xl p-3 transition-colors duration-200 ${flashClass}`}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="font-bold text-white text-sm">{symbol}</span>
        {onRemove && (
          <button
            onClick={() => onRemove(symbol)}
            className="text-zinc-600 hover:text-zinc-400 text-xs leading-none"
          >
            ✕
          </button>
        )}
      </div>
      {quote ? (
        <>
          <p className="text-xl font-semibold text-white">
            ${quote.price.toFixed(2)}
          </p>
          <p className={`text-xs font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? "+" : ""}
            {quote.change.toFixed(2)} ({isPositive ? "+" : ""}
            {quote.changePct.toFixed(2)}%)
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Vol: {quote.volume.toLocaleString()}
          </p>
        </>
      ) : (
        <div className="animate-pulse space-y-1">
          <div className="h-6 bg-zinc-800 rounded w-20" />
          <div className="h-3 bg-zinc-800 rounded w-16" />
        </div>
      )}
    </div>
  );
}
