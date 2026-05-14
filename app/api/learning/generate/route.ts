import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { generateLearningCards } from "@/lib/services/card-generator";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  try {
    const result = await generateLearningCards(userId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    const status = msg.includes("Need at least") || msg.includes("unavailable") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
