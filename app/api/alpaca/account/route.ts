import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PortfolioService } from "@/lib/services/portfolio";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const svc = await PortfolioService.forUser(
      (session.user as typeof session.user & { id: string }).id
    );
    const account = await svc.getAccount();
    return NextResponse.json(account);
  } catch (err) {
    console.error("[api/alpaca/account]", err);
    return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
  }
}
