import { NextResponse } from "next/server";
import { stopLossService } from "@/lib/services/stop-loss";

export async function POST(request: Request) {
  const secret = request.headers.get("x-job-secret");
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await stopLossService.checkAll();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[jobs/check-stop-losses]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
