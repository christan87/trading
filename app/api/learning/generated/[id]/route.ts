import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { reviewGeneratedCard } from "@/lib/services/card-generator";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id } = await params;
  const body = await req.json();
  const action = body.action as "approved" | "rejected";

  if (action !== "approved" && action !== "rejected") {
    return NextResponse.json({ error: "action must be approved or rejected" }, { status: 400 });
  }

  try {
    await reviewGeneratedCard(userId, id, action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Review failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
