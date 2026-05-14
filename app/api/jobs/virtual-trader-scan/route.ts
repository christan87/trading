import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/mongodb";
import { virtualTraderService } from "@/lib/services/virtual-trader";

export async function POST(request: Request) {
  const secret = request.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run daily scan for every user that has active virtual traders
    const { virtualTraders } = await getCollections();
    const userIds = await virtualTraders.distinct("userId", { "config.isActive": true });

    let totalPositionsOpened = 0;
    for (const uid of userIds) {
      const result = await virtualTraderService.runDailyScan(uid.toString());
      totalPositionsOpened += result.positionsOpened;
    }

    return NextResponse.json({ ok: true, usersProcessed: userIds.length, totalPositionsOpened });
  } catch (err) {
    console.error("[jobs/virtual-trader-scan]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
