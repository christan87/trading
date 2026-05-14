import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/mongodb";
import { virtualTraderService } from "@/lib/services/virtual-trader";

export async function POST(request: Request) {
  const secret = request.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { virtualTraders } = await getCollections();
    const userIds = await virtualTraders.distinct("userId", { "config.isActive": true });

    let totalChecked = 0;
    let totalClosed = 0;

    for (const uid of userIds) {
      const result = await virtualTraderService.monitorPositions(uid.toString());
      totalChecked += result.checked;
      totalClosed += result.closed;
    }

    return NextResponse.json({ ok: true, usersProcessed: userIds.length, totalChecked, totalClosed });
  } catch (err) {
    console.error("[jobs/virtual-trader-monitor]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
