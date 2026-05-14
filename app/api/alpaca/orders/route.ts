import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PortfolioService, NoAlpacaTokenError, type PlaceOrderParams } from "@/lib/services/portfolio";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = (req.nextUrl.searchParams.get("status") as "open" | "closed" | "all") ?? "open";

  try {
    const svc = await PortfolioService.forUser(
      (session.user as typeof session.user & { id: string }).id
    );
    const orders = await svc.getOrders(status);
    return NextResponse.json(orders);
  } catch (err) {
    if (err instanceof NoAlpacaTokenError) {
      return NextResponse.json({ error: "alpaca_not_connected" }, { status: 401 });
    }
    console.error("[api/alpaca/orders GET]", err);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PlaceOrderParams;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.symbol || !body.qty || !body.side || !body.type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const svc = await PortfolioService.forUser(
      (session.user as typeof session.user & { id: string }).id
    );
    const order = await svc.placeOrder(body);
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    if (err instanceof NoAlpacaTokenError) {
      return NextResponse.json({ error: "alpaca_not_connected" }, { status: 401 });
    }
    console.error("[api/alpaca/orders POST]", err);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
