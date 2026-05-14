import { NEWS_ANALYSIS_SCHEMA } from "./schemas";

export const NEWS_ANALYSIS_SYSTEM_PROMPT = `You are a financial news analyst. Summarize news articles about a stock and assess their likely market impact. Output only valid JSON matching the schema — no markdown, no extra text.

OUTPUT SCHEMA:
${NEWS_ANALYSIS_SCHEMA}`;

export function buildNewsAnalysisPrompt(
  symbol: string,
  articles: { headline: string; summary: string; publishedAt: string }[]
): string {
  return `Analyze the following news articles about ${symbol} and assess their market impact.

<news_articles>
${articles
  .map((a) => `[${a.publishedAt}] ${a.headline}\n${a.summary}`)
  .join("\n\n")}
</news_articles>

Return only valid JSON matching the schema.`;
}
