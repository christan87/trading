import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ScanDashboard } from "@/components/scan/ScanDashboard";

export default async function ScanPage() {
  const session = await auth();
  if (!session?.user) redirect("/settings");

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <ScanDashboard />
    </div>
  );
}
