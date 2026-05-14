"use client";

import { useEffect, useState } from "react";
import type { AiStatus } from "@/lib/services/ai-fallback";

export function AiStatusBanner() {
  const [status, setStatus] = useState<AiStatus>("available");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/ai-status");
        const data = await res.json();
        setStatus(data.status as AiStatus);
      } catch {
        // Network failure — don't show banner on transient errors
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (status === "available") return null;

  if (status === "degraded") {
    return (
      <div className="bg-yellow-900/40 border-b border-yellow-800 px-4 py-2 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
        <span className="text-yellow-300 font-medium">AI analysis degraded</span>
        <span className="text-yellow-500 text-xs">— showing last results & rules-based risk only. Auto-retrying.</span>
      </div>
    );
  }

  return (
    <div className="bg-red-900/40 border-b border-red-800 px-4 py-2 flex items-center gap-2 text-sm">
      <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
      <span className="text-red-300 font-medium">AI analysis is currently offline.</span>
      <span className="text-red-500 text-xs">The app is operating in manual mode.</span>
    </div>
  );
}
