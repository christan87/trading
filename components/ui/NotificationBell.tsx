"use client";

import { useEffect, useRef, useState } from "react";
import type { AppNotification } from "@/lib/db/models";

interface NotifData {
  notifications: AppNotification[];
  unreadCount: number;
}

const SEVERITY_STYLE: Record<string, string> = {
  urgent: "border-l-red-500 bg-red-950/30",
  warning: "border-l-yellow-500 bg-yellow-950/20",
  info: "border-l-zinc-600 bg-zinc-800/40",
};

const SEVERITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-zinc-500",
};

export function NotificationBell() {
  const [data, setData] = useState<NotifData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) setData(await res.json() as NotifData);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000); // poll every 30s
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setData((prev) => prev ? { ...prev, unreadCount: 0, notifications: prev.notifications.map((n) => ({ ...n, read: true })) } : prev);
  };

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setData((prev) => {
      if (!prev) return prev;
      const notifications = prev.notifications.map((n) =>
        (n._id as unknown as { toString(): string }).toString() === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    });
  };

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-semibold text-zinc-300">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!data || data.notifications.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">No notifications</p>
            ) : (
              data.notifications.map((n) => {
                const id = (n._id as unknown as { toString(): string }).toString();
                return (
                  <button
                    key={id}
                    onClick={() => markRead(id)}
                    className={`w-full text-left px-4 py-3 border-b border-zinc-800 last:border-0 border-l-2 transition-colors hover:bg-zinc-800/50 ${SEVERITY_STYLE[n.severity]} ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[n.severity]}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{n.title}</p>
                        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-zinc-600 mt-1">
                          {new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
