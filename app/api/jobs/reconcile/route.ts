import { NextRequest, NextResponse } from "next/server";
import { reconcileOutcomes } from "@/lib/services/outcome-tracker";

// Internal job endpoint — secured by a shared secret header
// Called by the BullMQ worker or a cron trigger
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await reconcileOutcomes();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[jobs/reconcile]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
