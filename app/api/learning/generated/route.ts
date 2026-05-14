import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getPendingGeneratedCards } from "@/lib/services/card-generator";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const cards = await getPendingGeneratedCards(userId);
  return NextResponse.json(cards);
}
