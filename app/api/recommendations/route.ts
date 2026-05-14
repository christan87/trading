import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runStrategyEngine } from "@/lib/services/strategy-engine";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

async function getSessionUser() {
  const session = await auth();
  const id = (session?.user as { id?: string })?.id;
  return id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
  const symbol = req.nextUrl.searchParams.get("symbol") ?? undefined;

  const { recommendations } = await getCollections();
  const query: Record<string, unknown> = { userId: new ObjectId(userId) };
  if (symbol) query.symbol = symbol.toUpperCase();

  const docs = await recommendations
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { symbol, timeframe, strategyType } = body;

  if (!symbol || !timeframe) {
    return NextResponse.json({ error: "symbol and timeframe are required" }, { status: 400 });
  }

  const result = await runStrategyEngine({
    userId,
    symbol: String(symbol).toUpperCase(),
    timeframe,
    strategyType,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Fetch the created recommendation to return it
  const { recommendations } = await getCollections();
  const doc = await recommendations.findOne({ _id: new ObjectId(result.recommendationId) });

  return NextResponse.json(doc, { status: 201 });
}
