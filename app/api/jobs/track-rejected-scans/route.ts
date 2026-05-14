import { NextRequest, NextResponse } from "next/server";
import { rejectedScanTracker } from "@/lib/services/rejected-scan-tracker";

// Runs daily — adds price checkpoints to unresolved rejected scans and resolves those past 30 days
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await rejectedScanTracker.addDailyCheckpoints();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[jobs/track-rejected-scans]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
