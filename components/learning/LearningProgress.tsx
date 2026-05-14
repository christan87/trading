"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { QuizModal } from "./QuizModal";

interface Progress {
  dueToday: number;
  totalCards: number;
  masteredCards: number;
  streakDays: number;
}

export function LearningProgress() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

  useEffect(() => {
    fetch("/api/learning/cards?mode=progress")
      .then((r) => r.json())
      .then(setProgress);
  }, [showQuiz]);

  if (!progress) return null;

  const masteryPct = progress.totalCards > 0
    ? Math.round((progress.masteredCards / progress.totalCards) * 100)
    : 0;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Learning Mode</p>
          </div>
          {progress.dueToday > 0 && (
            <button
              onClick={() => setShowQuiz(true)}
              className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-semibold px-3 py-1.5 rounded-lg"
            >
              Review {progress.dueToday} card{progress.dueToday > 1 ? "s" : ""}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-2xl font-bold text-yellow-400">{progress.dueToday}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Due today</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{progress.streakDays}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Day streak</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">{masteryPct}%</p>
            <p className="text-xs text-zinc-500 mt-0.5">Mastered</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-300">{progress.totalCards}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Total cards</p>
          </div>
        </div>

        {/* Mastery bar */}
        <div className="mt-3">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${masteryPct}%` }}
            />
          </div>
        </div>
      </Card>

      {showQuiz && <QuizModal onClose={() => setShowQuiz(false)} />}
    </>
  );
}
