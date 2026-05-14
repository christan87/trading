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

    let totalEvaluated = 0;
    let totalUpdated = 0;

    for (const uid of userIds) {
      const result = await virtualTraderService.runMonthlyEvaluation(uid.toString());
      totalEvaluated += result.evaluated;
      totalUpdated += result.updated;
    }

    return NextResponse.json({ ok: true, usersProcessed: userIds.length, totalEvaluated, totalUpdated });
  } catch (err) {
    console.error("[jobs/virtual-trader-monthly-eval]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
