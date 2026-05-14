import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDueCards, seedLearningCards, getLearningProgress } from "@/lib/services/learning";

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string })?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode");

  if (mode === "progress") {
    const progress = await getLearningProgress(userId);
    return NextResponse.json(progress);
  }

  // Seed cards if none exist yet
  await seedLearningCards(userId);

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);
  const cards = await getDueCards(userId, limit);
  return NextResponse.json(cards);
}
