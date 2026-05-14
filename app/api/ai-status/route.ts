import { NextResponse } from "next/server";
import { aiFallbackManager } from "@/lib/services/ai-fallback";

export async function GET() {
  const status = await aiFallbackManager.getAiStatus();
  return NextResponse.json({ status });
}
