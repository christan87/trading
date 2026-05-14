import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { marketDataService } from "@/lib/services/market-data";

// SSE endpoint: streams live quotes for a comma-separated list of symbols
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const symbolsParam = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50); // cap at 50

  if (symbols.length === 0) {
    return new Response("symbols query param required", { status: 400 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = async () => {
        for (const symbol of symbols) {
          try {
            const quote = await marketDataService.getQuote(symbol);
            const data = `data: ${JSON.stringify(quote)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            // Silently skip failed quotes — individual symbol errors shouldn't kill the stream
          }
        }
      };

      send();
      intervalId = setInterval(send, 5000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
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
