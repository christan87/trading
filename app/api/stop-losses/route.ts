import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stopLossService } from "@/lib/services/stop-loss";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const stops = await stopLossService.getActive(userId);
  return NextResponse.json(stops);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json() as {
    positionId: string;
    symbol: string;
    type: "fixed" | "trailing";
    percentageThreshold: number;
    entryPrice: number;
  };

  if (!body.positionId || !body.symbol || !body.type || !body.percentageThreshold || !body.entryPrice) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (body.percentageThreshold <= 0 || body.percentageThreshold >= 100) {
    return NextResponse.json({ error: "percentageThreshold must be between 1 and 99" }, { status: 400 });
  }

  try {
    const stop = await stopLossService.create({ userId, ...body });
    return NextResponse.json(stop, { status: 201 });
  } catch (err) {
    console.error("[api/stop-losses POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
