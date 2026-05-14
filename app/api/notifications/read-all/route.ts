import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { notificationService } from "@/lib/services/notifications";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  await notificationService.markAllRead(userId);
  return NextResponse.json({ ok: true });
}
