import { NextRequest, NextResponse } from "next/server";
import { marketScanService } from "@/lib/services/market-scan";

// Runs daily at midnight — deletes scan results older than 7 days
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const deleted = await marketScanService.deleteExpired();
    return NextResponse.json({ deleted });
  } catch (err) {
    console.error("[jobs/scan-cleanup]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
