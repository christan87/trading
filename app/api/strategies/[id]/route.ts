import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  applyStrategyUpdate,
  getStrategyWithVersions,
} from "@/lib/services/strategy-versioning";

// GET /api/strategies/[id] — fetch one strategy with full version history
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id: strategyType } = await params;

  const strategies = await getStrategyWithVersions(userId);
  const strategy = strategies.find((s) => s.type === strategyType);
  if (!strategy) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(strategy);
}

// PATCH /api/strategies/[id] — update parameters with automatic versioning
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id: strategyType } = await params;

  let body: { parameters: Record<string, unknown>; updateReason: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.parameters || !body.updateReason) {
    return NextResponse.json({ error: "parameters and updateReason are required" }, { status: 400 });
  }

  try {
    await applyStrategyUpdate(userId, strategyType, body.parameters, body.updateReason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}
