import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";

export type AiStatus = "available" | "degraded" | "unavailable";

interface CallRecord {
  timestamp: number;
  success: boolean;
  latencyMs: number;
}

const WINDOW_10_MIN = 10 * 60 * 1000;
const WINDOW_30_MIN = 30 * 60 * 1000;
const DEGRADED_THRESHOLD = 0.5; // >50% failures in 10 min
const UNAVAILABLE_THRESHOLD = 0.9; // >90% failures in 30 min

export class AiFallbackManager {
  private manualOverride: AiStatus | null = null;

  async recordCall(success: boolean, latencyMs: number): Promise<void> {
    const redis = getRedis();
    const record: CallRecord = { timestamp: Date.now(), success, latencyMs };
    await redis.lpush(REDIS_KEYS.aiCallLog, JSON.stringify(record));
    await redis.ltrim(REDIS_KEYS.aiCallLog, 0, 99); // keep last 100 calls
    await redis.expire(REDIS_KEYS.aiCallLog, 3600);
  }

  async getAiStatus(): Promise<AiStatus> {
    if (this.manualOverride) return this.manualOverride;

    const redis = getRedis();
    const rawRecords = await redis.lrange(REDIS_KEYS.aiCallLog, 0, 99);
    const records: CallRecord[] = rawRecords
      .map((r) => {
        try {
          return typeof r === "string" ? JSON.parse(r) : r;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const now = Date.now();

    const in10Min = records.filter((r) => now - r.timestamp < WINDOW_10_MIN);
    const in30Min = records.filter((r) => now - r.timestamp < WINDOW_30_MIN);

    if (in30Min.length >= 5) {
      const failRate30 = in30Min.filter((r) => !r.success).length / in30Min.length;
      if (failRate30 >= UNAVAILABLE_THRESHOLD) return "unavailable";
    }

    if (in10Min.length >= 3) {
      const failRate10 = in10Min.filter((r) => !r.success).length / in10Min.length;
      if (failRate10 >= DEGRADED_THRESHOLD) return "degraded";
    }

    return "available";
  }

  setManualOverride(status: AiStatus | null): void {
    this.manualOverride = status;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.getAiStatus()) === "available";
  }
}

export const aiFallbackManager = new AiFallbackManager();
