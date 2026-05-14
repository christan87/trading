import Anthropic from "@anthropic-ai/sdk";
import { getCollections } from "@/lib/db/mongodb";
import { marketDataService } from "./market-data";
import { NEWS_ANALYSIS_SYSTEM_PROMPT, buildNewsAnalysisPrompt } from "@/lib/prompts/news-analysis";
import { aiFallbackManager } from "./ai-fallback";
import { rateLimiter } from "@/lib/utils/rate-limiter";
import type { Recommendation } from "@/lib/db/models";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function reconcileOutcomes(): Promise<{ processed: number; resolved: number }> {
  const { recommendations } = await getCollections();

  const tracking = await recommendations
    .find({ "outcome.status": "tracking" })
    .toArray();

  let processed = 0;
  let resolved = 0;

  for (const rec of tracking) {
    try {
      const quote = await marketDataService.getQuote(rec.symbol);
      const currentPrice = quote.price;
      const entryPrice = rec.entry.price;
      const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;
      const onTrack =
        rec.direction === "long"
          ? currentPrice > entryPrice
          : currentPrice < entryPrice;

      const checkpoint = {
        date: new Date(),
        currentPrice,
        percentChange,
        onTrack,
        notes: `Price ${onTrack ? "on track" : "off track"} — ${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(2)}% from entry`,
      };

      const hitTarget =
        rec.direction === "long"
          ? currentPrice >= rec.target.price
          : currentPrice <= rec.target.price;

      const hitStop =
        rec.direction === "long"
          ? currentPrice <= rec.stopLoss.price
          : currentPrice >= rec.stopLoss.price;

      const timeframeDays: Record<string, number> = { intraday: 1, swing: 10, position: 60 };
      const maxDays = timeframeDays[rec.timeframe] ?? 10;
      const holdingDays = Math.floor(
        (Date.now() - rec.createdAt.getTime()) / 86400_000
      );
      const expired = holdingDays >= maxDays;

      if (hitTarget || hitStop || expired) {
        const exitReason = hitTarget
          ? "target_hit"
          : hitStop
          ? "stop_hit"
          : "time_limit";

        const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100 *
          (rec.direction === "short" ? -1 : 1);

        const finalResult: Recommendation["outcome"]["finalResult"] = {
          exitPrice: currentPrice,
          returnPct,
          hitTarget,
          hitStopLoss: hitStop,
          holdingPeriodDays: holdingDays,
          exitReason: exitReason as NonNullable<Recommendation["outcome"]["finalResult"]>["exitReason"],
        };

        const performedAsExpected = hitTarget || returnPct >= rec.target.expectedReturnPct * 0.5;

        let postMortem: string | null = null;
        const aiOk = await aiFallbackManager.isAvailable();
        if (aiOk) {
          postMortem = await generatePostMortem(rec, finalResult);
        }

        await recommendations.updateOne(
          { _id: rec._id },
          {
            $set: {
              "outcome.status": "resolved",
              "outcome.finalResult": finalResult,
              "outcome.performedAsExpected": performedAsExpected,
              "outcome.postMortem": postMortem,
            },
            $push: { "outcome.checkpoints": checkpoint },
          }
        );
        resolved++;
      } else {
        await recommendations.updateOne(
          { _id: rec._id },
          { $push: { "outcome.checkpoints": checkpoint } }
        );
      }

      processed++;
    } catch (err) {
      console.error(`[outcome-tracker] Error for ${rec.symbol}:`, err);
    }
  }

  return { processed, resolved };
}

async function generatePostMortem(
  rec: Recommendation,
  result: NonNullable<Recommendation["outcome"]["finalResult"]>
): Promise<string | null> {
  try {
    await rateLimiter.checkAndIncrement("anthropic");

    const newsPrompt = buildNewsAnalysisPrompt(
      rec.symbol,
      rec.snapshot.newsArticles.map((n) => ({
        headline: n.headline,
        summary: n.summary,
        publishedAt: n.publishedAt instanceof Date ? n.publishedAt.toISOString() : String(n.publishedAt),
      }))
    );

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: `${NEWS_ANALYSIS_SYSTEM_PROMPT}\n\nYou are also analyzing why a trade succeeded or failed. Be specific and reference the original thesis.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Original recommendation for ${rec.symbol}:
Strategy: ${rec.strategyType} (${rec.direction})
Entry: $${rec.entry.price} — "${rec.entry.condition}"
Target: $${rec.target.price} (+${rec.target.expectedReturnPct}%)
Stop: $${rec.stopLoss.price}
Original rationale: ${rec.rationale}

Actual outcome:
Exit price: $${result.exitPrice}
Return: ${result.returnPct.toFixed(2)}%
Exit reason: ${result.exitReason}
Holding period: ${result.holdingPeriodDays} days

${newsPrompt}

In 2-3 paragraphs, analyze why the trade performed as it did. Was the original thesis correct? What did the data miss? What can be learned?`,
        },
      ],
    });

    await aiFallbackManager.recordCall(true, 0);
    return response.content[0].type === "text" ? response.content[0].text : null;
  } catch (err) {
    await aiFallbackManager.recordCall(false, 0);
    console.error("[outcome-tracker] Post-mortem generation failed:", err);
    return null;
  }
}
