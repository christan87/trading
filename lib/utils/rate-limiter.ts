import { getRedis, REDIS_KEYS } from "./redis";

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const PROVIDER_LIMITS: Record<string, RateLimitConfig> = {
  alpaca_trading: { maxRequests: 200, windowSeconds: 60 },
  alpaca_data: { maxRequests: 200, windowSeconds: 60 },
  finnhub: { maxRequests: 60, windowSeconds: 60 },
  fred: { maxRequests: 120, windowSeconds: 60 },
  anthropic: { maxRequests: 50, windowSeconds: 60 },
};

export class RateLimiter {
  async checkAndIncrement(provider: string): Promise<{ allowed: boolean; remaining: number }> {
    const config = PROVIDER_LIMITS[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const redis = getRedis();
    const key = REDIS_KEYS.rateLimit(provider);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.windowSeconds;

    // Sliding window using sorted set: score = timestamp
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });
    pipeline.zcard(key);
    pipeline.expire(key, config.windowSeconds * 2);
    const results = await pipeline.exec();

    const count = (results[2] as number) ?? 0;
    const allowed = count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);

    return { allowed, remaining };
  }

  async waitForSlot(provider: string, maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const { allowed } = await this.checkAndIncrement(provider);
      if (allowed) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Rate limit exceeded for ${provider} after ${maxWaitMs}ms`);
  }
}

export const rateLimiter = new RateLimiter();
