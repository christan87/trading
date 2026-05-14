import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketScanService } from "@/lib/services/market-scan";
import type { ScanResult } from "@/lib/db/models";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { status: ScanResult["status"] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validStatuses: ScanResult["status"][] = ["new", "reviewed", "dismissed", "acted"];
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    await marketScanService.updateStatus(id, body.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/scan/results PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
