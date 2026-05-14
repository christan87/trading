import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { detectCongressPatterns } from "@/lib/services/congress-patterns";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "60"), 7), 180);

  try {
    const report = await detectCongressPatterns(days);
    return NextResponse.json(report);
  } catch (err) {
    console.error("Congress patterns error:", err);
    return NextResponse.json({ error: "Pattern detection failed" }, { status: 500 });
  }
}
