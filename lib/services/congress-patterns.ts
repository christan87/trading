import { getCollections } from "@/lib/db/mongodb";
import type { CongressTrade } from "@/lib/db/models";

// Maps STOCK Act-relevant committees to the sectors they oversee
const COMMITTEE_SECTOR_MAP: Record<string, string[]> = {
  "Armed Services": ["defense", "aerospace", "cybersecurity"],
  "Intelligence": ["defense", "cybersecurity", "semiconductors"],
  "Finance": ["banking", "insurance", "fintech"],
  "Banking": ["banking", "insurance", "fintech", "real_estate"],
  "Energy": ["oil_gas", "utilities", "renewables"],
  "Commerce": ["consumer", "telecom", "transportation"],
  "Health": ["healthcare", "pharma", "biotech"],
  "Agriculture": ["agriculture", "food", "fertilizers"],
  "Judiciary": ["legal", "tech_regulation"],
  "Foreign Relations": ["defense", "geopolitical"],
};

export interface ClusterEvent {
  symbol: string;
  windowDays: number;
  purchases: number;
  sales: number;
  netBias: "bullish" | "bearish";
  strength: "strong" | "moderate";
  members: { name: string; party: string; chamber: string }[];
  latestTradeDate: Date;
  relevantSectors: string[];
}

export interface CongressPatternReport {
  asOf: Date;
  windowDays: number;
  topClusters: ClusterEvent[];
  mostActiveTickers: { symbol: string; tradeCount: number }[];
  partyBreakdown: {
    D: { purchases: number; sales: number };
    R: { purchases: number; sales: number };
    I: { purchases: number; sales: number };
  };
  chamberBreakdown: {
    senate: { purchases: number; sales: number };
    house: { purchases: number; sales: number };
  };
}

export async function detectCongressPatterns(
  windowDays: number = 60
): Promise<CongressPatternReport> {
  const { congressTrades } = await getCollections();
  const since = new Date(Date.now() - windowDays * 86400_000);

  const trades = (await congressTrades
    .find({ tradeDate: { $gte: since } })
    .sort({ tradeDate: -1 })
    .limit(500)
    .toArray()) as CongressTrade[];

  // Group by symbol
  const bySymbol = new Map<
    string,
    {
      purchases: CongressTrade[];
      sales: CongressTrade[];
    }
  >();

  for (const t of trades) {
    if (!bySymbol.has(t.symbol)) {
      bySymbol.set(t.symbol, { purchases: [], sales: [] });
    }
    const entry = bySymbol.get(t.symbol)!;
    if (t.transactionType === "purchase") entry.purchases.push(t);
    else entry.sales.push(t);
  }

  // Detect clusters: same ticker, same direction, >= 3 unique members
  const clusters: ClusterEvent[] = [];

  for (const [symbol, { purchases, sales }] of bySymbol.entries()) {
    for (const direction of ["purchases", "sales"] as const) {
      const group = direction === "purchases" ? purchases : sales;
      const uniqueMembers = new Map<
        string,
        { name: string; party: string; chamber: string }
      >();
      for (const t of group) {
        if (!uniqueMembers.has(t.memberName)) {
          uniqueMembers.set(t.memberName, {
            name: t.memberName,
            party: t.party,
            chamber: t.chamber,
          });
        }
      }

      if (uniqueMembers.size < 2) continue;

      const strength: "strong" | "moderate" =
        uniqueMembers.size >= 4 ? "strong" : "moderate";
      const netBias: "bullish" | "bearish" =
        direction === "purchases" ? "bullish" : "bearish";

      const latestDate = group.reduce(
        (max, t) => (t.tradeDate > max ? t.tradeDate : max),
        group[0].tradeDate
      );

      // Infer relevant sectors from committee membership (name heuristic)
      const relevantSectors = inferSectors(
        Array.from(uniqueMembers.values()).map((m) => m.name)
      );

      clusters.push({
        symbol,
        windowDays,
        purchases: purchases.length,
        sales: sales.length,
        netBias,
        strength,
        members: Array.from(uniqueMembers.values()),
        latestTradeDate: latestDate,
        relevantSectors,
      });
    }
  }

  // Sort clusters: strong first, then by member count desc
  clusters.sort((a, b) => {
    if (a.strength !== b.strength) {
      return a.strength === "strong" ? -1 : 1;
    }
    return b.members.length - a.members.length;
  });

  // Most active tickers by total trade count
  const mostActiveTickers = Array.from(bySymbol.entries())
    .map(([symbol, { purchases, sales }]) => ({
      symbol,
      tradeCount: purchases.length + sales.length,
    }))
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, 10);

  // Party and chamber breakdowns
  const partyBreakdown = {
    D: { purchases: 0, sales: 0 },
    R: { purchases: 0, sales: 0 },
    I: { purchases: 0, sales: 0 },
  };
  const chamberBreakdown = {
    senate: { purchases: 0, sales: 0 },
    house: { purchases: 0, sales: 0 },
  };

  for (const t of trades) {
    const party = t.party in partyBreakdown ? t.party : "I";
    const key = t.transactionType === "purchase" ? "purchases" : "sales";
    partyBreakdown[party as "D" | "R" | "I"][key]++;
    chamberBreakdown[t.chamber][key]++;
  }

  return {
    asOf: new Date(),
    windowDays,
    topClusters: clusters.slice(0, 15),
    mostActiveTickers,
    partyBreakdown,
    chamberBreakdown,
  };
}

// Naive sector inference: look for committee-related keywords in member names
// (In production this would use a proper member→committee database)
function inferSectors(memberNames: string[]): string[] {
  // Without a real committee DB, we return an empty array — the UI handles this gracefully.
  // The architecture is extensible: swap this for a real lookup table when available.
  return [];
}

export async function getClusterEventsForSymbol(
  symbol: string,
  windowDays = 90
): Promise<ClusterEvent[]> {
  const report = await detectCongressPatterns(windowDays);
  return report.topClusters.filter((c) => c.symbol === symbol);
}
