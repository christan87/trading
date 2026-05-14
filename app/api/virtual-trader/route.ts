import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { virtualTraderService } from "@/lib/services/virtual-trader";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  try {
    const traders = await virtualTraderService.getForUser(userId);
    return NextResponse.json(traders);
  } catch (err) {
    console.error("[api/virtual-trader GET]", err);
    return NextResponse.json({ error: "Failed to fetch virtual traders" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await request.json() as {
    strategyId: string;
    virtualBalance: number;
    targetRoiPct: number;
    maxPositionSizePct: number;
  };

  if (!body.strategyId || !ObjectId.isValid(body.strategyId)) {
    return NextResponse.json({ error: "Invalid strategyId" }, { status: 400 });
  }
  if (typeof body.virtualBalance !== "number" || body.virtualBalance < 1000) {
    return NextResponse.json({ error: "virtualBalance must be at least 1000" }, { status: 400 });
  }

  // Enforce at most 5 virtual traders per user
  const { virtualTraders } = await getCollections();
  const count = await virtualTraders.countDocuments({ userId: new ObjectId(userId) });
  if (count >= 5) {
    return NextResponse.json({ error: "Maximum 5 virtual traders allowed" }, { status: 400 });
  }

  try {
    const trader = await virtualTraderService.createForUser(userId, body.strategyId, {
      virtualBalance: body.virtualBalance,
      targetRoiPct: body.targetRoiPct ?? 10,
      maxPositionSizePct: body.maxPositionSizePct ?? 5,
    });
    return NextResponse.json(trader, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
