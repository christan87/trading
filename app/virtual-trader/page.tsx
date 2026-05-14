import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VirtualTraderDashboard } from "@/components/virtual-trader/VirtualTraderDashboard";

export default async function VirtualTraderPage() {
  const session = await auth();
  if (!session?.user) redirect("/settings");

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <VirtualTraderDashboard />
    </div>
  );
}
