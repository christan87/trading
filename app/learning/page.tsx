import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LearningProgress } from "@/components/learning/LearningProgress";
import { TipsPanel } from "@/components/learning/TipsPanel";
import { GeneratedCardReview } from "@/components/learning/GeneratedCardReview";

export default async function LearningPage() {
  const session = await auth();
  if (!session?.user) redirect("/settings");

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-white">Learning Mode</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Spaced repetition flashcards built from trading strategy tips. Cards due today are shown first.
        </p>
      </div>

      <LearningProgress />

      <GeneratedCardReview />

      <div className="space-y-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Browse Tips by Strategy</p>
        <TipsPanel strategyType="momentum" defaultOpen={false} />
        <TipsPanel strategyType="mean_reversion" defaultOpen={false} />
        <TipsPanel strategyType="breakout" defaultOpen={false} />
        <TipsPanel strategyType="earnings_play" defaultOpen={false} />
        <TipsPanel strategyType="options_spread" defaultOpen={false} />
        <TipsPanel strategyType="general" defaultOpen={false} />
      </div>
    </div>
  );
}
