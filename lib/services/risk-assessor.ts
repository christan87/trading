import type { Recommendation } from "@/lib/db/models";

export interface Tier1Input {
  symbol: string;
  assetType: "equity" | "option";
  daysToExpiration?: number;        // options only
  earningsInDays?: number | null;   // null = unknown
  vix: number;
  avgDailyVolume: number;           // shares/day
  positionSizePct: number;          // % of portfolio
  tradingWithTrend: boolean;        // true = with 50d SMA, false = against
}

export interface Tier2Input {
  score: number;
  factors: string[];
  methodology: string;
}

export type RiskTier1 = Recommendation["risk"]["bestPractices"];
export type RiskCombined = Recommendation["risk"]["combined"];

export function calculateTier1Risk(input: Tier1Input): RiskTier1 {
  const factors: string[] = [];
  let raw = 0;

  if (input.earningsInDays !== null && input.earningsInDays !== undefined && input.earningsInDays <= 5) {
    raw += 2;
    factors.push(`Earnings in ${input.earningsInDays} day(s) — elevated event risk`);
  }

  if (input.vix > 25) {
    raw += 1;
    factors.push(`VIX at ${input.vix.toFixed(1)} — elevated market volatility`);
  }

  if (input.positionSizePct > 5) {
    raw += 2;
    factors.push(`Position size ${input.positionSizePct.toFixed(1)}% exceeds 5% portfolio limit`);
  }

  if (input.assetType === "option" && input.daysToExpiration !== undefined && input.daysToExpiration < 7) {
    raw += 2;
    factors.push(`Option expires in ${input.daysToExpiration} day(s) — less than 7 DTE`);
  }

  if (input.avgDailyVolume < 1_000_000) {
    raw += 2;
    factors.push(`Avg daily volume ${(input.avgDailyVolume / 1e6).toFixed(2)}M below $1M liquidity threshold`);
  }

  if (!input.tradingWithTrend) {
    raw += 1;
    factors.push("Trade direction is against the 50-day SMA trend");
  }

  // Max possible raw = 10, normalize to 1-10
  const maxRaw = 10;
  const score = Math.max(1, Math.min(10, Math.round((raw / maxRaw) * 9) + 1));

  const methodParts = factors.length > 0
    ? `Risk score ${score}/10 based on: ${factors.join("; ")}.`
    : "Risk score 1/10 — no elevated risk factors identified by rules-based assessment.";

  return { score, factors, methodology: methodParts };
}

export function combineTiers(
  tier1: RiskTier1,
  tier2: Tier2Input | null
): { combined: RiskCombined; datadriven: Recommendation["risk"]["datadriven"] } {
  let combinedScore: number;
  let weightBP: number;
  let weightDD: number;

  const datadriven: Recommendation["risk"]["datadriven"] = tier2 ?? {
    score: tier1.score,
    factors: ["AI analysis unavailable — using rules-based score only"],
    methodology: "Tier 2 (data-driven) unavailable. Combined risk falls back to Tier 1 only.",
  };

  if (tier2) {
    weightBP = 0.4;
    weightDD = 0.6;
    combinedScore = Math.round(tier1.score * weightBP + tier2.score * weightDD);
  } else {
    weightBP = 1.0;
    weightDD = 0.0;
    combinedScore = tier1.score;
  }

  combinedScore = Math.max(1, Math.min(10, combinedScore));

  const label: RiskCombined["label"] =
    combinedScore <= 3 ? "low"
    : combinedScore <= 5 ? "moderate"
    : combinedScore <= 7 ? "high"
    : "very_high";

  return {
    datadriven,
    combined: { score: combinedScore, weightBestPractices: weightBP, weightDataDriven: weightDD, label },
  };
}
