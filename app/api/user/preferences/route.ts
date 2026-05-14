import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getCollections } from "@/lib/db/mongodb";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const allowed = new Set(["tipsEnabled", "learningModeEnabled", "aiEnabled", "orderSizeType", "scanSchedule", "notificationSettings"]);
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) updates[`preferences.${k}`] = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid preference fields provided" }, { status: 400 });
  }

  try {
    const { users } = await getCollections();
    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/user/preferences PATCH]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  try {
    const { users } = await getCollections();
    const user = await users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { preferences: 1 } }
    );
    return NextResponse.json(user?.preferences ?? {});
  } catch (err) {
    console.error("[api/user/preferences GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
