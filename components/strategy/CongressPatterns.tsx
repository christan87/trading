"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { CongressPatternReport, ClusterEvent } from "@/lib/services/congress-patterns";

const WINDOW_OPTIONS = [30, 60, 90] as const;

function ClusterCard({ cluster }: { cluster: ClusterEvent }) {
  const isBullish = cluster.netBias === "bullish";
  const biasColor = isBullish ? "text-emerald-400" : "text-red-400";
  const biasLabel = isBullish ? "Cluster Buy" : "Cluster Sell";

  return (
    <div className="flex items-start justify-between py-3 border-b border-zinc-800 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{cluster.symbol}</span>
          <span className={`text-xs font-medium ${biasColor}`}>{biasLabel}</span>
          {cluster.strength === "strong" && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
              Strong
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          {cluster.members.length} members · {cluster.purchases}P / {cluster.sales}S
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">
          {cluster.members
            .slice(0, 3)
            .map((m) => `${m.name} (${m.party})`)
            .join(", ")}
          {cluster.members.length > 3 && ` +${cluster.members.length - 3} more`}
        </p>
      </div>
      <div className="text-right ml-3 flex-shrink-0">
        <p className="text-xs text-zinc-600">
          {new Date(cluster.latestTradeDate).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export function CongressPatterns() {
  const [windowDays, setWindowDays] = useState<30 | 60 | 90>(60);
  const [data, setData] = useState<CongressPatternReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"clusters" | "overview">("clusters");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/congress/patterns?days=${windowDays}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [windowDays]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>Congressional Trading Patterns</CardTitle>
          <div className="flex items-center gap-1">
            {WINDOW_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  windowDays === d
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-zinc-800 mb-4">
        {(["clusters", "overview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-yellow-500 text-yellow-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "clusters" ? "Cluster Events" : "Market Overview"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-zinc-800 rounded" />
          ))}
        </div>
      )}

      {!loading && data && tab === "clusters" && (
        <div>
          {data.topClusters.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-6">
              No cluster events detected in the last {windowDays} days.
              <br />
              Clusters require 2+ members trading the same ticker in the same direction.
            </p>
          ) : (
            <div>
              {data.topClusters.map((c, i) => (
                <ClusterCard key={`${c.symbol}-${c.netBias}-${i}`} cluster={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && data && tab === "overview" && (
        <div className="space-y-4">
          {/* Most active tickers */}
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">
              Most Active Tickers
            </p>
            <div className="grid grid-cols-2 gap-2">
              {data.mostActiveTickers.slice(0, 8).map((t) => (
                <div
                  key={t.symbol}
                  className="flex justify-between items-center bg-zinc-800/50 rounded px-3 py-2"
                >
                  <span className="text-sm font-medium text-zinc-200">
                    {t.symbol}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {t.tradeCount} trades
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Party breakdown */}
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">
              Party Activity
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(["D", "R", "I"] as const).map((party) => {
                const d = data.partyBreakdown[party];
                return (
                  <div key={party} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                    <p
                      className={`text-sm font-bold ${
                        party === "D"
                          ? "text-blue-400"
                          : party === "R"
                          ? "text-red-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {party}
                    </p>
                    <p className="text-xs text-emerald-400 mt-1">
                      {d.purchases}P
                    </p>
                    <p className="text-xs text-red-400">{d.sales}S</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chamber breakdown */}
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">
              Chamber Activity
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["senate", "house"] as const).map((chamber) => {
                const d = data.chamberBreakdown[chamber];
                return (
                  <div key={chamber} className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-400 font-medium capitalize mb-2">
                      {chamber}
                    </p>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-400">{d.purchases} purchases</span>
                      <span className="text-red-400">{d.sales} sales</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-zinc-600 text-center">
            Data sourced from STOCK Act disclosures via Finnhub. Reporting lag up to 45 days.
          </p>
        </div>
      )}
    </Card>
  );
}
