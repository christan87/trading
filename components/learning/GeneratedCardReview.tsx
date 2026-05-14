"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { GeneratedLearningCard } from "@/lib/db/models";

function GeneratedCard({
  card,
  onReview,
}: {
  card: GeneratedLearningCard;
  onReview: (id: string, action: "approved" | "rejected") => void;
}) {
  const [reviewing, setReviewing] = useState(false);

  const review = async (action: "approved" | "rejected") => {
    setReviewing(true);
    try {
      await fetch(`/api/learning/generated/${card._id.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      onReview(card._id.toString(), action);
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="border border-zinc-700/60 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xs bg-zinc-700/60 text-zinc-400 px-2 py-0.5 rounded-full">
            {card.strategyType.replace(/_/g, " ")}
          </span>
          <p className="text-xs text-zinc-600 mt-1">{card.sourceContext}</p>
        </div>
        <span className="text-xs text-zinc-600">
          {card.questionType === "multiple_choice" ? "MC" : "T/F"}
        </span>
      </div>

      <p className="text-sm text-zinc-200 font-medium mb-3">{card.question}</p>

      <div className="space-y-1.5 mb-3">
        {card.options.map((opt, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              i === card.correctAnswer
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                : "bg-zinc-800/50 text-zinc-500"
            }`}
          >
            <span className="font-medium w-4">
              {String.fromCharCode(65 + i)}.
            </span>
            <span>{opt}</span>
            {i === card.correctAnswer && (
              <span className="ml-auto text-emerald-400 font-medium">✓</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-500 italic mb-4">{card.explanation}</p>

      <div className="flex gap-2">
        <button
          onClick={() => review("approved")}
          disabled={reviewing}
          className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 text-emerald-400 text-xs font-medium py-2 rounded-lg transition-colors border border-emerald-600/30"
        >
          {reviewing ? "…" : "Add to deck"}
        </button>
        <button
          onClick={() => review("rejected")}
          disabled={reviewing}
          className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 disabled:opacity-40 text-zinc-400 text-xs font-medium py-2 rounded-lg transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function GeneratedCardReview() {
  const [cards, setCards] = useState<GeneratedLearningCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/learning/generated")
      .then((r) => r.json())
      .then((d) => {
        setCards(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/learning/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
        return;
      }
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleReview = (id: string) => {
    setCards((prev) => prev.filter((c) => c._id.toString() !== id));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>AI-Generated Cards</CardTitle>
          {cards.length > 0 && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-medium">
              {cards.length} pending
            </span>
          )}
        </div>
      </CardHeader>

      <p className="text-xs text-zinc-500 mb-4">
        Claude analyzes your trade history to generate personalized quiz cards. Review each one before it&apos;s added to your deck.
      </p>

      <div className="mb-4">
        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          {generating ? "Generating from your trade history…" : "Generate New Cards"}
        </button>
        {generating && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-2">
            <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            Claude is analyzing your resolved trades…
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && cards.length === 0 && (
        <p className="text-xs text-zinc-600 text-center py-4">
          No cards pending review. Generate new cards from your trade history above.
          <br />
          <span className="text-zinc-700">
            Requires at least 5 resolved trades.
          </span>
        </p>
      )}

      {!loading && (
        <div className="space-y-3">
          {cards.map((card) => (
            <GeneratedCard
              key={card._id.toString()}
              card={card}
              onReview={handleReview}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
