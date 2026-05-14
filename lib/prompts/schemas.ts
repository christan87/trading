// JSON schema strings embedded in Claude prompts for structured output validation

export const RECOMMENDATION_OUTPUT_SCHEMA = `
{
  "symbol": "string",
  "assetType": "equity | option",
  "strategyType": "momentum | mean_reversion | earnings_play | options_spread | breakout | other",
  "timeframe": "intraday | swing | position",
  "direction": "long | short",
  "entry": { "price": number, "condition": "string describing entry trigger" },
  "target": { "price": number, "expectedReturnPct": number },
  "stopLoss": { "price": number, "maxLossPct": number },
  "optionDetails": null | {
    "contractType": "call | put",
    "suggestedStrike": number,
    "suggestedExpiration": "YYYY-MM-DD",
    "suggestedStrategy": "long_call | long_put | bull_call_spread | bear_put_spread | covered_call | cash_secured_put"
  },
  "dataDrivenRisk": {
    "score": number (1-10, 1=lowest risk),
    "factors": ["array of risk factor strings"],
    "methodology": "explanation of how score was calculated"
  },
  "confidence": number (0-100),
  "rationale": "Claude's full reasoning — 2-4 paragraphs"
}
`;

export const NEWS_ANALYSIS_SCHEMA = `
{
  "summary": "2-3 sentence summary of news impact on the stock",
  "sentiment": "positive | negative | neutral",
  "keyEvents": ["array of key events mentioned"],
  "catalysts": ["potential price catalysts identified"],
  "risks": ["risks or headwinds identified"]
}
`;
