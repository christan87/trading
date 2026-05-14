import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";
import { rejectedScanTracker } from "@/lib/services/rejected-scan-tracker";
import { getCollections } from "@/lib/db/mongodb";
import type { ScanResult } from "@/lib/db/models";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { id } = await params;
  let body: { status: ScanResult["status"] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validStatuses: ScanResult["status"][] = ["new", "viewed", "promoted", "dismissed"];
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    await marketScanService.updateStatus(id, body.status);

    if (body.status === "dismissed") {
      const { scanResults } = await getCollections();
      const scanResult = await scanResults.findOne({ _id: new ObjectId(id) });
      if (scanResult) {
        rejectedScanTracker.recordUserDismiss({
          scanResultId: id,
          userId,
          scanResult: {
            scanId: scanResult.scanId,
            symbol: scanResult.symbol,
            sector: scanResult.sector,
            triggerSummary: scanResult.triggerSummary,
          },
        }).catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/scan/results PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
