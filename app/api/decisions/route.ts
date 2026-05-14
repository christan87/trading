import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollections } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import type { Decision } from "@/lib/db/models";

async function getSessionUser() {
  const session = await auth();
  return (session?.user as { id?: string })?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const action = req.nextUrl.searchParams.get("action");

  const { decisions } = await getCollections();
  const query: Record<string, unknown> = { userId: new ObjectId(userId) };
  if (action) query.action = action;

  const docs = await decisions
    .find(query)
    .sort({ decidedAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { recommendationId, action, modifications } = body;

  if (!recommendationId || !action) {
    return NextResponse.json({ error: "recommendationId and action required" }, { status: 400 });
  }
  if (!["accepted", "dismissed", "modified"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let recId: ObjectId;
  try {
    recId = new ObjectId(recommendationId);
  } catch {
    return NextResponse.json({ error: "Invalid recommendationId" }, { status: 400 });
  }

  const { decisions, recommendations } = await getCollections();
  const uid = new ObjectId(userId);

  // Verify recommendation belongs to user
  const rec = await recommendations.findOne({ _id: recId, userId: uid });
  if (!rec) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });

  const decision: Omit<Decision, "_id"> = {
    userId: uid,
    recommendationId: recId,
    action,
    modifications: modifications ?? null,
    tradeId: null,
    decidedAt: new Date(),
    closedAt: null,
  };

  const result = await decisions.insertOne(decision as Decision);

  // If accepted, move recommendation to "tracking"
  if (action === "accepted") {
    await recommendations.updateOne(
      { _id: recId },
      { $set: { "outcome.status": "tracking" } }
    );
  }

  return NextResponse.json({ decisionId: result.insertedId.toString() }, { status: 201 });
}
