import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/utils/redis";

const POLL_INTERVAL_MS = 500;
const MAX_DURATION_MS = 150_000; // 2.5 minutes max

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const scanId = req.nextUrl.searchParams.get("scanId");
  if (!scanId) {
    return new Response("scanId query param required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const redis = getRedis();
  const key = REDIS_KEYS.scanEvents(scanId);

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let nextIndex = 0;

  const stream = new ReadableStream({
    start(controller) {
      const send = (eventType: string, data: object) => {
        if (closed) return;
        const line = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      const doPoll = async () => {
        if (closed) return;
        if (Date.now() - startedAt >= MAX_DURATION_MS) {
          try { controller.close(); } catch { /* already closed */ }
          return;
        }

        let done = false;
        try {
          const items = await redis.lrange<string>(key, nextIndex, -1);
          for (const raw of items) {
            if (closed) return;
            nextIndex++;
            let event: { type: string; [key: string]: unknown };
            try {
              event = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof event);
            } catch {
              continue;
            }

            const { type, ...payload } = event;
            send(type ?? "message", payload);

            if (type === "done") {
              done = true;
              break;
            }
          }
        } catch {
          // Redis error — continue polling
        }

        if (done || closed) {
          if (!closed) {
            try { controller.close(); } catch { /* already closed */ }
          }
          return;
        }

        pollTimer = setTimeout(doPoll, POLL_INTERVAL_MS);
      };

      doPoll();
    },
    cancel() {
      closed = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
