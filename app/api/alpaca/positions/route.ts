import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PortfolioService, NoAlpacaTokenError } from "@/lib/services/portfolio";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const svc = await PortfolioService.forUser(
      (session.user as typeof session.user & { id: string }).id
    );
    const positions = await svc.getPositions();
    return NextResponse.json(positions);
  } catch (err) {
    if (err instanceof NoAlpacaTokenError) {
      return NextResponse.json({ error: "alpaca_not_connected" }, { status: 401 });
    }
    console.error("[api/alpaca/positions]", err);
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}
