import { NextRequest, NextResponse } from "next/server";
import { marketScanService } from "@/lib/services/market-scan";

// Internal job endpoint — secured by shared secret header
// Triggered by cron or user-initiated scan from the UI
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const summary = await marketScanService.runScan();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[jobs/scan]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
