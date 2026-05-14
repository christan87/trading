import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getRoiData } from "@/lib/services/roi-tracker";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const data = await getRoiData(userId);
  return NextResponse.json(data);
}
