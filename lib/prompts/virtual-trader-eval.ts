export const VIRTUAL_TRADER_EVAL_SYSTEM_PROMPT = `You are a quantitative trading strategy analyst. You evaluate the monthly performance of a virtual trading strategy and produce actionable parameter adjustments. Your output must be valid JSON only — no prose, no markdown.

Rules:
- Analyze closed position outcomes to identify what worked and what did not.
- Suggest parameter changes that could improve win rate or risk-adjusted return.
- Be conservative: only suggest changes when there is sufficient evidence (≥5 closed trades in the month).
- Never suggest increasing position size above 10% of portfolio.
- Output must match the schema exactly.

Output schema:
{
  "analysis": "string — 2-3 sentence summary of what the data shows",
  "adjustments": [
    {
      "parameter": "string",
      "currentValue": "string",
      "suggestedValue": "string",
      "rationale": "string"
    }
  ],
  "keepRunning": boolean
}

If fewer than 5 trades were closed this month, return adjustments: [] and keepRunning: true with a note in analysis.`;

export function buildVirtualTraderEvalPrompt(params: {
  strategyType: string;
  month: string;
  config: {
    virtualBalance: number;
    targetRoiPct: number;
    maxPositionSizePct: number;
  };
  currentBalance: number;
  monthReturn: number;
  closedPositions: {
    symbol: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    realizedPnlPct: number;
    exitReason: string;
    holdingDays: number;
    rationale: string;
  }[];
  openPositionCount: number;
  priorMonthlyReturns: { month: string; returnPct: number }[];
}): string {
  const { strategyType, month, config, currentBalance, monthReturn, closedPositions, openPositionCount, priorMonthlyReturns } = params;
  const winCount = closedPositions.filter((p) => p.realizedPnlPct > 0).length;
  const winRate = closedPositions.length > 0 ? Math.round((winCount / closedPositions.length) * 100) : 0;
  const avgReturn = closedPositions.length > 0
    ? Math.round((closedPositions.reduce((s, p) => s + p.realizedPnlPct, 0) / closedPositions.length) * 100) / 100
    : 0;

  return `<strategy>
  <type>${strategyType}</type>
  <month>${month}</month>
  <config>
    <virtualBalance>${config.virtualBalance}</virtualBalance>
    <targetRoiPct>${config.targetRoiPct}%</targetRoiPct>
    <maxPositionSizePct>${config.maxPositionSizePct}%</maxPositionSizePct>
    <currentBalance>${currentBalance}</currentBalance>
    <monthReturn>${monthReturn}%</monthReturn>
  </config>
</strategy>

<monthly_performance>
  <closedTrades>${closedPositions.length}</closedTrades>
  <openPositions>${openPositionCount}</openPositions>
  <winRate>${winRate}%</winRate>
  <avgReturn>${avgReturn}%</avgReturn>
</monthly_performance>

<closed_positions>
${closedPositions.map((p) => `  <position symbol="${p.symbol}" side="${p.side}" entry="${p.entryPrice}" exit="${p.exitPrice}" pnlPct="${p.realizedPnlPct}" reason="${p.exitReason}" holdingDays="${p.holdingDays}">
    <rationale>${p.rationale}</rationale>
  </position>`).join("\n")}
</closed_positions>

<prior_monthly_returns>
${priorMonthlyReturns.map((m) => `  <month label="${m.month}" returnPct="${m.returnPct}"/>`).join("\n")}
</prior_monthly_returns>

Analyze this strategy's performance and return JSON with parameter adjustments.`;
}
