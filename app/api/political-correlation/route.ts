import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { analyzePoliticalCorrelation } from "@/lib/services/political-correlation";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

  try {
    const result = await analyzePoliticalCorrelation(symbol.toUpperCase().trim(), userId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Political correlation error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
