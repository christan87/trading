import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { revertToVersion } from "@/lib/services/strategy-versioning";

// POST /api/strategies/[id]/revert
// Body: { versionNumber: number; reason: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id: strategyType } = await params;

  let body: { versionNumber: number; reason: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.versionNumber || !body.reason) {
    return NextResponse.json({ error: "versionNumber and reason are required" }, { status: 400 });
  }

  try {
    await revertToVersion(userId, strategyType, body.versionNumber, body.reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
