"use client";

import { useEffect, useState } from "react";
import type { Tip } from "@/lib/data/tips";

interface TipsPanelProps {
  strategyType?: string;
  defaultOpen?: boolean;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: "text-emerald-400",
  intermediate: "text-yellow-400",
  advanced: "text-red-400",
};

export function TipsPanel({ strategyType, defaultOpen = true }: TipsPanelProps) {
  const [tips, setTips] = useState<Tip[]>([]);
  const [open, setOpen] = useState(defaultOpen);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const url = strategyType
      ? `/api/learning/tips?strategy=${strategyType}`
      : "/api/learning/tips";
    fetch(url)
      .then((r) => r.json())
      .then((data: Tip[]) => {
        setTips(data);
        setActiveIdx(0);
      });
  }, [strategyType]);

  if (tips.length === 0) return null;

  const tip = tips[activeIdx];

  // Render simple markdown: bold, line breaks
  const renderContent = (md: string) =>
    md.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <p key={i} className="leading-relaxed">
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="text-white">{part}</strong> : part
          )}
        </p>
      );
    });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-sm">💡</span>
          <span className="text-sm font-medium text-zinc-300">
            Strategy Tips
            {strategyType && (
              <span className="ml-1.5 text-zinc-500 font-normal">
                · {strategyType.replace(/_/g, " ")}
              </span>
            )}
          </span>
        </div>
        <span className="text-zinc-500 text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800">
          {/* Tip tabs */}
          <div className="flex gap-1 px-3 pt-3 overflow-x-auto pb-1">
            {tips.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setActiveIdx(i)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  i === activeIdx
                    ? "bg-yellow-500/20 border-yellow-600 text-yellow-300"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {t.title.length > 24 ? t.title.slice(0, 22) + "…" : t.title}
              </button>
            ))}
          </div>

          {/* Active tip */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{tip.title}</h3>
              <span className={`text-xs ${DIFFICULTY_COLOR[tip.difficulty]}`}>
                {tip.difficulty}
              </span>
            </div>
            <div className="text-sm text-zinc-400 space-y-1.5">
              {renderContent(tip.content)}
            </div>
            {tip.relatedConcepts.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tip.relatedConcepts.map((c) => (
                  <span
                    key={c}
                    className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-4 pb-3 text-xs text-zinc-500">
            <button
              onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
              disabled={activeIdx === 0}
              className="disabled:opacity-30 hover:text-zinc-300"
            >
              ← Prev
            </button>
            <span>{activeIdx + 1} / {tips.length}</span>
            <button
              onClick={() => setActiveIdx((i) => Math.min(tips.length - 1, i + 1))}
              disabled={activeIdx === tips.length - 1}
              className="disabled:opacity-30 hover:text-zinc-300"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
