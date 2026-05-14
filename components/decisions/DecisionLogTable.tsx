"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SnapshotComparison } from "./SnapshotComparison";

interface Decision {
  _id: string;
  recommendationId: string;
  action: "accepted" | "dismissed" | "modified";
  decidedAt: string;
  closedAt: string | null;
}

interface RecommendationSummary {
  _id: string;
  symbol: string;
  strategyType: string;
  direction: string;
  confidence: number;
  outcome: { status: string; finalResult: { returnPct: number } | null; performedAsExpected: boolean | null };
}

const ACTION_BADGE: Record<string, "green" | "red" | "yellow"> = {
  accepted: "green",
  dismissed: "red",
  modified: "yellow",
};

export function DecisionLogTable() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [recs, setRecs] = useState<Record<string, RecommendationSummary>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/decisions?limit=50");
      const docs: Decision[] = await res.json();
      setDecisions(docs);

      // Fetch recommendation summaries in parallel
      const recIds = [...new Set(docs.map((d) => d.recommendationId))];
      const recDocs = await Promise.all(
        recIds.map((id) => fetch(`/api/recommendations/${id}`).then((r) => r.json()).catch(() => null))
      );
      const recMap: Record<string, RecommendationSummary> = {};
      recDocs.forEach((r) => { if (r?._id) recMap[r._id] = r; });
      setRecs(recMap);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Decision Log</CardTitle>
            <span className="text-xs text-zinc-500">{decisions.length} decisions</span>
          </div>
        </CardHeader>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-zinc-800 rounded" />)}
          </div>
        ) : decisions.length === 0 ? (
          <p className="text-sm text-zinc-500">No decisions logged yet. Accept or dismiss a recommendation to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left pb-2 pr-4">Symbol</th>
                  <th className="text-left pb-2 pr-4">Strategy</th>
                  <th className="text-center pb-2 pr-4">Action</th>
                  <th className="text-center pb-2 pr-4">Outcome</th>
                  <th className="text-right pb-2 pr-4">Return</th>
                  <th className="text-right pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => {
                  const rec = recs[d.recommendationId];
                  const result = rec?.outcome?.finalResult;
                  return (
                    <tr
                      key={d._id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                      onClick={() => setSelectedRecId(d.recommendationId)}
                    >
                      <td className="py-2.5 pr-4 font-medium text-white">
                        {rec?.symbol ?? "—"}
                        {rec && <span className="ml-1 text-xs text-zinc-500">{rec.direction}</span>}
                      </td>
                      <td className="pr-4 text-zinc-400 text-xs">{rec?.strategyType.replace(/_/g, " ") ?? "—"}</td>
                      <td className="text-center pr-4">
                        <Badge variant={ACTION_BADGE[d.action] ?? "gray"}>{d.action}</Badge>
                      </td>
                      <td className="text-center pr-4">
                        {rec?.outcome.status === "resolved" ? (
                          <Badge variant={rec.outcome.performedAsExpected ? "green" : "red"}>
                            {rec.outcome.performedAsExpected ? "✓ Hit" : "✗ Missed"}
                          </Badge>
                        ) : rec?.outcome.status === "tracking" ? (
                          <Badge variant="yellow">Tracking</Badge>
                        ) : (
                          <Badge variant="gray">—</Badge>
                        )}
                      </td>
                      <td className={`text-right pr-4 font-medium text-sm ${result ? (result.returnPct >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-600"}`}>
                        {result ? `${result.returnPct >= 0 ? "+" : ""}${result.returnPct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="text-right text-xs text-zinc-500">
                        {new Date(d.decidedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedRecId && (
        <SnapshotComparison
          recommendationId={selectedRecId}
          onClose={() => setSelectedRecId(null)}
        />
      )}
    </>
  );
}
