import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { virtualTraderService } from "@/lib/services/virtual-trader";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { virtualTraders } = await getCollections();
  const trader = await virtualTraders.findOne({
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
  });

  if (!trader) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(trader);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json() as Partial<{
    targetRoiPct: number;
    maxPositionSizePct: number;
    isActive: boolean;
  }>;

  const allowed = ["targetRoiPct", "maxPositionSizePct", "isActive"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key as keyof typeof body];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    await virtualTraderService.updateConfig(id, userId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/virtual-trader PATCH]", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
