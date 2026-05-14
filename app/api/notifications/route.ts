import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { notificationService } from "@/lib/services/notifications";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const [notifications, unreadCount] = await Promise.all([
    notificationService.getRecent(userId, 30),
    notificationService.getUnreadCount(userId),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
