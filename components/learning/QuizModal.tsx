"use client";

import { useEffect, useState } from "react";
import type { LearningCard } from "@/lib/db/models";
import type { DifficultyRating } from "@/lib/services/learning";

interface QuizModalProps {
  onClose: () => void;
}

type Phase = "question" | "result" | "done";

const DIFFICULTY_OPTIONS: { label: string; value: DifficultyRating; color: string }[] = [
  { label: "Very Easy", value: "very_easy", color: "bg-emerald-700 hover:bg-emerald-600" },
  { label: "Easy", value: "easy", color: "bg-green-700 hover:bg-green-600" },
  { label: "Fair", value: "fair", color: "bg-yellow-700 hover:bg-yellow-600" },
  { label: "Hard", value: "hard", color: "bg-orange-700 hover:bg-orange-600" },
  { label: "Very Hard", value: "very_hard", color: "bg-red-700 hover:bg-red-600" },
];

export function QuizModal({ onClose }: QuizModalProps) {
  const [cards, setCards] = useState<LearningCard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("question");
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/learning/cards?limit=5")
      .then((r) => r.json())
      .then((data: LearningCard[]) => {
        setCards(data);
        setLoading(false);
      });
  }, []);

  const card = cards[cardIdx] as (LearningCard & { _id: { toString(): string } }) | undefined;

  const handleAnswer = (optionIdx: number) => {
    if (phase !== "question") return;
    setSelected(optionIdx);
  };

  const handleSubmit = async () => {
    if (selected === null || !card || submitting) return;
    setSubmitting(true);

    // Reveal answer first (optimistic)
    setPhase("result");
    setExplanation(card.explanation);
    setSubmitting(false);
  };

  const handleRating = async (rating: DifficultyRating) => {
    if (!card) return;
    setSubmitting(true);

    await fetch(`/api/learning/cards/${card._id.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });

    if (cardIdx < cards.length - 1) {
      setCardIdx((i) => i + 1);
      setSelected(null);
      setPhase("question");
      setExplanation("");
    } else {
      setPhase("done");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-white">Learning Mode</h2>
            {cards.length > 0 && phase !== "done" && (
              <p className="text-xs text-zinc-500 mt-0.5">
                Card {cardIdx + 1} of {cards.length}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">✕</button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-center py-8 text-zinc-500">Loading cards…</div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-zinc-300 font-medium">No cards due for review!</p>
              <p className="text-sm text-zinc-500">Check back later — your next review is scheduled based on your performance.</p>
            </div>
          ) : phase === "done" ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">🎉</div>
              <p className="text-zinc-200 font-semibold">Session complete!</p>
              <p className="text-sm text-zinc-500">You reviewed {cards.length} card{cards.length > 1 ? "s" : ""}. Keep it up.</p>
              <button
                onClick={onClose}
                className="mt-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm px-5 py-2 rounded-lg"
              >
                Done
              </button>
            </div>
          ) : card ? (
            <>
              {/* Question */}
              <div className="mb-5">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  {card.strategyType.replace(/_/g, " ")} · {card.questionType === "true_false" ? "True / False" : "Multiple Choice"}
                </span>
                <p className="mt-2 text-sm font-medium text-white leading-relaxed">{card.question}</p>
              </div>

              {/* Options */}
              <div className="space-y-2 mb-5">
                {card.options.map((opt, i) => {
                  let cls = "border border-zinc-700 text-zinc-300 hover:border-zinc-500";
                  if (phase === "result") {
                    if (i === card.correctAnswer) cls = "border border-emerald-600 bg-emerald-900/30 text-emerald-300";
                    else if (i === selected && i !== card.correctAnswer) cls = "border border-red-700 bg-red-900/20 text-red-400";
                    else cls = "border border-zinc-800 text-zinc-600";
                  } else if (selected === i) {
                    cls = "border border-yellow-600 bg-yellow-900/20 text-yellow-300";
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={phase === "result"}
                      className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${cls}`}
                    >
                      <span className="text-xs text-zinc-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Explanation */}
              {phase === "result" && (
                <div className="bg-zinc-800/60 rounded-lg p-3 mb-5">
                  <p className="text-xs text-zinc-500 mb-1 font-semibold uppercase tracking-wider">Explanation</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{explanation}</p>
                </div>
              )}

              {/* Actions */}
              {phase === "question" ? (
                <button
                  onClick={handleSubmit}
                  disabled={selected === null || submitting}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-semibold text-sm py-2.5 rounded-lg transition-colors"
                >
                  Check Answer
                </button>
              ) : (
                <div>
                  <p className="text-xs text-zinc-500 mb-2 text-center">How difficult was this?</p>
                  <div className="flex gap-1.5 flex-wrap justify-center">
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => handleRating(d.value)}
                        disabled={submitting}
                        className={`text-xs text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors ${d.color}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
