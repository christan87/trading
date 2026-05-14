import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AccountSummary } from "@/components/dashboard/AccountSummary";
import { PositionsTable } from "@/components/dashboard/PositionsTable";
import { WatchList } from "@/components/dashboard/WatchList";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { OptionsChain } from "@/components/dashboard/OptionsChain";
import { LearningProgress } from "@/components/learning/LearningProgress";
import { RoiTarget } from "@/components/dashboard/RoiTarget";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/settings");

  const { symbol = "SPY" } = await searchParams;

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <AccountSummary />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <LearningProgress />
        <RoiTarget />
      </div>
      <WatchList />
      <PositionsTable />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PriceChart symbol={symbol} />
        <OptionsChain symbol={symbol} />
      </div>
    </div>
  );
}
