"use client";

import { useState, useEffect } from "react";

interface Props {
  symbol: string;
  side: "buy" | "sell";
  currentPrice: number;
  assetType: "equity" | "option";
  contractPrice?: number;           // for options: mid-price of the contract
  onSubmit: (qty: number) => Promise<void>;
  onCancel: () => void;
}

type SizeType = "shares" | "dollars";

function calcShares(
  dollarAmount: number,
  price: number,
  assetType: "equity" | "option",
  contractPrice?: number
): number {
  if (assetType === "option" && contractPrice && contractPrice > 0) {
    return Math.floor(dollarAmount / (contractPrice * 100));
  }
  if (price <= 0) return 0;
  return Math.floor(dollarAmount / price);
}

function calcActualDollars(
  shares: number,
  price: number,
  assetType: "equity" | "option",
  contractPrice?: number
): number {
  if (assetType === "option" && contractPrice && contractPrice > 0) {
    return shares * contractPrice * 100;
  }
  return shares * price;
}

export function OrderEntryPanel({
  symbol,
  side,
  currentPrice,
  assetType,
  contractPrice,
  onSubmit,
  onCancel,
}: Props) {
  const [sizeType, setSizeType] = useState<SizeType>("shares");
  const [rawValue, setRawValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load saved preference
  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((prefs) => {
        if (prefs.orderSizeType) setSizeType(prefs.orderSizeType);
      })
      .catch(() => undefined);
  }, []);

  const numValue = parseFloat(rawValue) || 0;

  const resolvedShares =
    sizeType === "shares"
      ? Math.floor(numValue)
      : calcShares(numValue, currentPrice, assetType, contractPrice);

  const actualDollars = calcActualDollars(resolvedShares, currentPrice, assetType, contractPrice);

  const handleSizeTypeChange = async (next: SizeType) => {
    setSizeType(next);
    setRawValue("");
    // Persist preference
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderSizeType: next }),
    }).catch(() => undefined);
  };

  const handleSubmit = async () => {
    if (resolvedShares <= 0) {
      setError("Quantity must be at least 1 share.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(resolvedShares);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const priceLabel =
    assetType === "option" && contractPrice
      ? `Contract mid $${contractPrice.toFixed(2)} (=$${(contractPrice * 100).toFixed(2)}/contract)`
      : `Current price $${currentPrice.toFixed(2)}`;

  return (
    <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">
          {side.toUpperCase()} {symbol}
        </p>
        <p className="text-xs text-zinc-500">{priceLabel}</p>
      </div>

      {/* Size type toggle */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5 w-fit">
        {(["shares", "dollars"] as SizeType[]).map((t) => (
          <button
            key={t}
            onClick={() => handleSizeTypeChange(t)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              sizeType === t
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Input */}
      <div>
        <label className="text-xs text-zinc-500 block mb-1">
          {sizeType === "shares" ? "Number of shares" : "Dollar amount"}
        </label>
        <div className="relative">
          {sizeType === "dollars" && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
          )}
          <input
            type="number"
            min={0}
            step={sizeType === "shares" ? 1 : 10}
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder={sizeType === "shares" ? "e.g. 10" : "e.g. 1000"}
            className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 ${sizeType === "dollars" ? "pl-7 pr-3" : "px-3"}`}
          />
        </div>
      </div>

      {/* Derived display */}
      {numValue > 0 && (
        <div className="bg-zinc-900 rounded-lg px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between text-zinc-400">
            <span>Shares to {side}</span>
            <span className="text-white font-medium">{resolvedShares.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Actual {side === "buy" ? "cost" : "proceeds"}</span>
            <span className="text-white font-medium">${actualDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {sizeType === "dollars" && numValue !== actualDollars && (
            <p className="text-zinc-600">
              Rounded down from ${numValue.toFixed(2)} due to whole-share requirement.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || resolvedShares <= 0}
          className="flex-1 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold py-2 rounded-lg transition-colors"
        >
          {submitting ? "Placing…" : `Place ${side.toUpperCase()} Order`}
        </button>
      </div>

      <p className="text-xs text-zinc-600 italic">
        Orders are submitted to Alpaca paper trading. Verify symbol and quantity before confirming. This is not investment advice.
      </p>
    </div>
  );
}
