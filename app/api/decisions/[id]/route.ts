import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";

async function getSessionUser() {
  const session = await auth();
  return (session?.user as { id?: string })?.id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { decisions } = await getCollections();
  const doc = await decisions.findOne({ _id: objId, userId: new ObjectId(userId) });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(doc);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { closedAt } = await req.json();
  const { decisions } = await getCollections();

  await decisions.updateOne(
    { _id: objId, userId: new ObjectId(userId) },
    { $set: { closedAt: closedAt ? new Date(closedAt) : new Date() } }
  );

  return NextResponse.json({ updated: true });
}
