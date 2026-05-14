import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

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
  return NextResponse.json({ watchlist: user?.watchlist ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol } = await req.json();
  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const ticker = symbol.toUpperCase().trim();
  const { users } = await getCollections();
  await users.updateOne(
    { _id: new ObjectId(ctx.id) },
    { $addToSet: { watchlist: ticker }, $set: { updatedAt: new Date() } }
  );
  return NextResponse.json({ added: ticker });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol } = await req.json();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { users } = await getCollections();
  await users.updateOne(
    { _id: new ObjectId(ctx.id) },
    { $pull: { watchlist: symbol.toUpperCase() }, $set: { updatedAt: new Date() } }
  );
  return NextResponse.json({ removed: symbol.toUpperCase() });
}
