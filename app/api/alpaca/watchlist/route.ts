import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getCollections } from "@/lib/db/mongodb";
import { marketDataService } from "@/lib/services/market-data";
import type { WatchlistItem } from "@/lib/db/models";

async function getSession() {
  const session = await auth();
  if (!session?.user) return null;
  const id = (session.user as { id?: string }).id;
  if (!id) return null;
  return { session, id };
}

export async function GET() {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { users } = await getCollections();
  const user = await users.findOne({ _id: new ObjectId(ctx.id) });

  // Migrate legacy string[] entries on first read
  const raw = (user?.watchlist ?? []) as (WatchlistItem | string)[];
  const items: WatchlistItem[] = raw.map((entry) => {
    if (typeof entry === "string") {
      return { symbol: entry, addedAt: new Date(0), priceWhenAdded: 0, sourceRecommendationId: null, sourceScanId: null, notes: null };
    }
    return entry;
  });

  return NextResponse.json({ watchlist: items });
}

export async function POST(req: NextRequest) {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    symbol?: string;
    priceWhenAdded?: number;
    sourceRecommendationId?: string;
    sourceScanId?: string;
    notes?: string;
  };

  if (!body.symbol || typeof body.symbol !== "string") {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const ticker = body.symbol.toUpperCase().trim();

  // Resolve price if not provided
  let addPrice = body.priceWhenAdded ?? 0;
  if (!addPrice) {
    try {
      const quote = await marketDataService.getQuote(ticker);
      addPrice = quote.price;
    } catch {
      // proceed with 0 if price fetch fails
    }
  }

  const item: WatchlistItem = {
    symbol: ticker,
    addedAt: new Date(),
    priceWhenAdded: addPrice,
    sourceRecommendationId: body.sourceRecommendationId ? new ObjectId(body.sourceRecommendationId) : null,
    sourceScanId: body.sourceScanId ?? null,
    notes: body.notes ?? null,
  };

  const { users } = await getCollections();

  // Remove any existing entry for this symbol (string or object), then add the new item
  await users.updateOne(
    { _id: new ObjectId(ctx.id) },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $pull: { watchlist: { symbol: ticker } as any },
      $set: { updatedAt: new Date() },
    }
  );
  await users.updateOne(
    { _id: new ObjectId(ctx.id) },
    {
      $push: { watchlist: item },
      $set: { updatedAt: new Date() },
    }
  );

  return NextResponse.json({ added: item });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol } = await req.json() as { symbol?: string };
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const ticker = symbol.toUpperCase();
  const { users } = await getCollections();
  await users.updateOne(
    { _id: new ObjectId(ctx.id) },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $pull: { watchlist: { symbol: ticker } as any },
      $set: { updatedAt: new Date() },
    }
  );
  return NextResponse.json({ removed: ticker });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol, notes } = await req.json() as { symbol?: string; notes?: string };
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { users } = await getCollections();
  await users.updateOne(
    { _id: new ObjectId(ctx.id), "watchlist.symbol": symbol.toUpperCase() },
    { $set: { "watchlist.$.notes": notes ?? null, updatedAt: new Date() } }
  );
  return NextResponse.json({ ok: true });
}
