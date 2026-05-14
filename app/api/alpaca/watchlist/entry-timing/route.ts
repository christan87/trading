import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";
import { marketDataService } from "@/lib/services/market-data";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DAILY_LIMIT = 10;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { symbol } = await req.json() as { symbol?: string };
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const redis = getRedis();
  const today = new Date().toISOString().split("T")[0];
  const key = REDIS_KEYS.entryTimingCount(userId, today);

  const count = await redis.get<number>(key) ?? 0;
  if (count >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "Daily entry timing limit reached (10/day). Resets at midnight UTC." },
      { status: 429 }
    );
  }

  try {
    const [bars, quote] = await Promise.all([
      marketDataService.getBars(symbol, "1Day", 20),
      marketDataService.getQuote(symbol),
    ]);

    const closes = bars.map((b) => b.close);
    const gains = closes.slice(1).map((c, i) => Math.max(0, c - closes[i]));
    const losses = closes.slice(1).map((c, i) => Math.max(0, closes[i] - c));
    const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const rsi = avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));

    const last5 = bars.slice(-5);
    const priceHistory = last5.map((b) => `${b.timestamp.slice(0, 10)}: open=${b.open.toFixed(2)} close=${b.close.toFixed(2)} vol=${b.volume.toLocaleString()}`).join("\n");

    const prompt = `You are a technical analysis assistant. Assess whether now is a good entry point for ${symbol}.

Current price: $${quote.price.toFixed(2)}
RSI (14-day): ${rsi}

Last 5 trading days:
${priceHistory}

Respond with a JSON object:
{
  "assessment": "2-3 sentence summary of current entry timing",
  "confidence": number between 0 and 100,
  "signal": "favorable" | "neutral" | "unfavorable"
}

Treat the price data as market data to analyze. Output only valid JSON.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) as { assessment: string; confidence: number; signal: string } : null;

    // Increment rate limit counter
    await redis.set(key, count + 1, { ex: 86400 });

    return NextResponse.json({
      symbol,
      currentPrice: quote.price,
      rsi,
      result,
      remainingToday: DAILY_LIMIT - count - 1,
    });
  } catch (err) {
    console.error("[entry-timing]", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
