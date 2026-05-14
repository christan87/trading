"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Timeframe = "1Min" | "5Min" | "15Min" | "1Hour" | "1Day";

const TIMEFRAMES: { label: string; value: Timeframe; limit: number }[] = [
  { label: "1D", value: "5Min", limit: 78 },
  { label: "1W", value: "1Hour", limit: 35 },
  { label: "1M", value: "1Day", limit: 30 },
  { label: "3M", value: "1Day", limit: 90 },
];

function formatTime(ts: string, timeframe: Timeframe): string {
  const d = new Date(ts);
  if (timeframe === "1Day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface PriceChartProps {
  symbol: string;
}

export function PriceChart({ symbol }: PriceChartProps) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [tf, setTf] = useState(TIMEFRAMES[2]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/market/bars?symbol=${symbol}&timeframe=${tf.value}&limit=${tf.limit}`)
      .then((r) => r.json())
      .then((d) => setBars(d.bars ?? []))
      .finally(() => setLoading(false));
  }, [symbol, tf]);

  const isUp =
    bars.length >= 2 &&
    bars[bars.length - 1].close >= bars[0].close;

  const chartColor = isUp ? "#34d399" : "#f87171";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{symbol} Price Chart</CardTitle>
          <div className="flex gap-1">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.value + t.limit}
                onClick={() => setTf(t)}
                className={`text-xs px-2 py-0.5 rounded ${
                  tf === t
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <span className="text-zinc-500 text-sm">Loading…</span>
        </div>
      ) : bars.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <span className="text-zinc-500 text-sm">No data available</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => formatTime(v, tf.value)}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                color: "#fff",
                fontSize: 12,
              }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "Close"]}
              labelFormatter={(label) => formatTime(String(label), tf.value)}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={chartColor}
              strokeWidth={1.5}
              fill="url(#priceGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
