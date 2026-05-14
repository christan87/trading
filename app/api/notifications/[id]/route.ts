import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { notificationService } from "@/lib/services/notifications";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  await notificationService.markRead(id, userId);
  return NextResponse.json({ ok: true });
}
