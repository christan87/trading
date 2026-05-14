import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { calculatePerformance } from "@/lib/services/performance-tracker";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const summary = await calculatePerformance(userId);
  return NextResponse.json(summary);
}
