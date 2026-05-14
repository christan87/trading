import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DecisionLogTable } from "@/components/decisions/DecisionLogTable";

export default async function DecisionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/settings");

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-white">Decision Log</h1>
      <p className="text-sm text-zinc-500">
        Click any row to view the full snapshot comparison — what the world looked like when the recommendation was made vs. what actually happened.
      </p>
      <DecisionLogTable />
    </div>
  );
}
