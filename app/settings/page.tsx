import { auth, signIn } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Brokerage Connection</h2>
        {session?.user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-zinc-300">Connected to Alpaca Markets</span>
            </div>
            <p className="text-xs text-zinc-500">{session.user.email}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Connect your Alpaca paper trading account to get started.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("alpaca", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Connect Alpaca Account
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          About
        </h2>
        <p className="text-sm text-zinc-500">
          Trading Assistant is a personal decision-support tool. All trade decisions rest with you.
          AI recommendations are for informational purposes only and are not investment advice.
        </p>
      </div>
    </div>
  );
}
