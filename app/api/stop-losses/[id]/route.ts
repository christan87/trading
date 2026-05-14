import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stopLossService } from "@/lib/services/stop-loss";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  try {
    await stopLossService.cancel(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
