import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { virtualTraderService } from "@/lib/services/virtual-trader";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Verify ownership
  const { virtualTraders } = await getCollections();
  const trader = await virtualTraders.findOne({
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
  });
  if (!trader) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "open" | "closed" | null;

  const positions = await virtualTraderService.getPositions(id, status ?? undefined);
  return NextResponse.json(positions);
}
