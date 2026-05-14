import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { submitAnswer, type DifficultyRating } from "@/lib/services/learning";

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string })?.id ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { rating } = await req.json();

  const validRatings: DifficultyRating[] = ["very_easy", "easy", "fair", "hard", "very_hard"];
  if (!validRatings.includes(rating)) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  try {
    const result = await submitAnswer(userId, id, rating as DifficultyRating);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
