"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult } from "@/lib/db/models";
import type { ScanProgress } from "@/lib/services/market-scan";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
const FALLBACK_POLL_MS = 5000;

interface Props {
  scanId: string;
  onResult: (result: ScanResult) => void;
  onRejection: () => void;
  onDone: () => void;
}

type ConnState = "connecting" | "open" | "reconnecting" | "failed";

export function ScanProgressBar({ scanId, onResult, onRejection, onDone }: Props) {
  const [progress, setProgress] = useState<ScanProgress>({
    scanId,
    step: 1,
    stepLabel: "Connecting…",
    percentComplete: 0,
    candidatesFound: 0,
    candidatesAnalyzed: 0,
    candidatesTotal: 0,
  });
  const [complete, setComplete] = useState(false);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Stable refs so callbacks in EventSource closures never go stale
  const onResultRef = useRef(onResult);
  const onRejectionRef = useRef(onRejection);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onRejectionRef.current = onRejection; }, [onRejection]);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const completeRef = useRef(false);
  const mountedRef = useRef(true);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownResultIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    };
  }, []);

  const startFallbackPolling = useCallback(() => {
    if (fallbackIntervalRef.current) return;

    fallbackIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current || completeRef.current) {
        if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
        return;
      }
      try {
        const res = await fetch(`/api/scan?scanId=${encodeURIComponent(scanId)}`);
        if (!res.ok) return;
        const { results } = await res.json() as { results: ScanResult[] };
        for (const r of results ?? []) {
          const id = (r._id as unknown as { toString(): string }).toString();
          if (!knownResultIds.current.has(id)) {
            knownResultIds.current.add(id);
            onResultRef.current(r);
          }
        }
      } catch { /* silent — will retry */ }
    }, FALLBACK_POLL_MS);
  }, [scanId]);

  const openSSE = useCallback((attempt: number) => {
    if (!mountedRef.current || completeRef.current) return;

    const es = new EventSource(`/api/scan/progress?scanId=${encodeURIComponent(scanId)}`);

    es.addEventListener("progress", (e) => {
      if (!mountedRef.current) return;
      try {
        setProgress(JSON.parse(e.data) as ScanProgress);
        setConnState("open");
      } catch { /* ignore malformed */ }
    });

    es.addEventListener("result", (e) => {
      if (!mountedRef.current) return;
      try {
        const { data } = JSON.parse(e.data) as { data: ScanResult };
        const id = (data._id as unknown as { toString(): string }).toString();
        if (!knownResultIds.current.has(id)) {
          knownResultIds.current.add(id);
          onResultRef.current(data);
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("rejection", () => {
      if (mountedRef.current) onRejectionRef.current();
    });

    es.addEventListener("done", () => {
      es.close();
      if (!mountedRef.current) return;
      completeRef.current = true;
      setComplete(true);
      setConnState("open");
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      setTimeout(() => {
        if (mountedRef.current) onDoneRef.current();
      }, 3000);
    });

    es.onerror = () => {
      es.close();
      if (!mountedRef.current || completeRef.current) return;

      const nextAttempt = attempt + 1;
      if (nextAttempt <= MAX_RECONNECT_ATTEMPTS) {
        setConnState("reconnecting");
        setReconnectAttempt(nextAttempt);
        setTimeout(() => openSSE(nextAttempt), RECONNECT_DELAY_MS);
      } else {
        setConnState("failed");
        startFallbackPolling();
      }
    };

    return () => es.close();
  }, [scanId, startFallbackPolling]);

  useEffect(() => {
    const cleanup = openSSE(0);
    return () => {
      cleanup?.();
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    };
  }, [openSSE]);

  const pct = progress.percentComplete;
  const barColor = complete ? "bg-emerald-500" : "bg-yellow-500";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-zinc-300 font-medium min-w-0 truncate">
          {complete
            ? `Scan complete — ${progress.candidatesFound} result${progress.candidatesFound !== 1 ? "s" : ""} found`
            : connState === "reconnecting"
            ? `Reconnecting… (attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`
            : connState === "failed"
            ? "Connection lost. Results are still being saved — refresh to see them."
            : progress.stepLabel}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          {!complete && progress.candidatesTotal > 0 && connState !== "failed" && (
            <span className="text-xs text-zinc-500 tabular-nums">
              {progress.candidatesAnalyzed}/{progress.candidatesTotal} analyzed
            </span>
          )}
          {connState !== "failed" && (
            <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
          )}
        </div>
      </div>

      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            connState === "failed" ? "bg-zinc-600" : barColor
          }`}
          style={{ width: connState === "failed" ? "100%" : `${pct}%` }}
        />
      </div>

      {connState === "failed" && (
        <p className="text-xs text-zinc-500">
          Scan may still be running. Refresh to see results.
        </p>
      )}

      {!complete && connState === "open" && progress.step >= 4 && progress.candidatesTotal > 0 && (
        <p className="text-xs text-zinc-600">Results appear as each candidate is analyzed.</p>
      )}
    </div>
  );
}
