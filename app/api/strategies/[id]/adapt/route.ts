import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  generateAdaptation,
  getAdaptations,
  acknowledgeAdaptation,
} from "@/lib/services/adaptive-learning";

// GET /api/strategies/[id]/adapt — list adaptations for a strategy type
// POST /api/strategies/[id]/adapt — trigger new adaptation analysis
// PATCH /api/strategies/[id]/adapt — acknowledge an adaptation

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id: strategyType } = await params;

  const adaptations = await getAdaptations(userId, strategyType);
  return NextResponse.json(adaptations);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id: strategyType } = await params;

  try {
    const adaptation = await generateAdaptation(userId, strategyType);
    return NextResponse.json(adaptation, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Adaptation failed";
    const status = msg.includes("Not enough") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  await params; // id is strategyType — not used for PATCH; adaptationId comes from body

  const body = await req.json();
  const { adaptationId } = body;
  if (!adaptationId) return NextResponse.json({ error: "adaptationId required" }, { status: 400 });

  await acknowledgeAdaptation(userId, adaptationId);
  return NextResponse.json({ ok: true });
}
