import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getStrategyWithVersions } from "@/lib/services/strategy-versioning";

// GET /api/strategies/list — all strategy documents with version history
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const strategies = await getStrategyWithVersions(userId);
  return NextResponse.json(strategies);
}
