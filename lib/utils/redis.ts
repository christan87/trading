import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

export const REDIS_KEYS = {
  aiHealth: "ai:health",
  aiCallLog: "ai:calls",
  rateLimit: (provider: string) => `ratelimit:${provider}`,
  watchlist: (userId: string) => `watchlist:${userId}`,
  quote: (symbol: string) => `quote:${symbol}`,
  quoteChannel: (symbol: string) => `quotes:${symbol}`,
  userChannel: (userId: string) => `user:${userId}:quotes`,
  optionsScanCount: (date: string) => `options_scan:daily_count:${date}`,
  pennyScanCount: (date: string) => `penny_scan:daily_count:${date}`,
  entryTimingCount: (userId: string, date: string) => `entry_timing:${userId}:${date}`,
  notifUnread: (userId: string) => `notif:unread:${userId}`,
} as const;
