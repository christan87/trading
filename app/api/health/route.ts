import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/mongodb";
import { getRedis } from "@/lib/utils/redis";

export async function GET() {
  const results: Record<string, string> = {};

  // MongoDB
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    results.mongodb = "ok";
  } catch (err) {
    results.mongodb = `error: ${String(err).slice(0, 200)}`;
  }

  // Redis
  try {
    const redis = getRedis();
    await redis.ping();
    results.redis = "ok";
  } catch (err) {
    results.redis = `error: ${String(err).slice(0, 200)}`;
  }

  const allOk = Object.values(results).every((v) => v === "ok");
  return NextResponse.json(results, { status: allOk ? 200 : 503 });
}
