import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { rejectedScanTracker } from "@/lib/services/rejected-scan-tracker";

// GET /api/scan/rejection-accuracy — returns rejection accuracy stats for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  try {
    const stats = await rejectedScanTracker.getRejectionAccuracy(userId);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[api/scan/rejection-accuracy]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
