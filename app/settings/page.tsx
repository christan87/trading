import { auth, signIn } from "@/lib/auth";

const REDIRECT_URI = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/callback/alpaca`;
const CLIENT_ID_SET = Boolean(process.env.ALPACA_CLIENT_ID);
const CLIENT_SECRET_SET = Boolean(process.env.ALPACA_CLIENT_SECRET);

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      <span className={ok ? "text-zinc-400" : "text-red-400"}>{label}</span>
      <span className={`ml-auto ${ok ? "text-zinc-600" : "text-red-500"}`}>
        {ok ? "set" : "missing"}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await auth();
  const allConfigured = CLIENT_ID_SET && CLIENT_SECRET_SET;

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
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Connect your Alpaca paper trading account to get started.
            </p>

            {/* Env var status */}
            <div className="space-y-1.5 text-xs">
              <ConfigRow label="ALPACA_CLIENT_ID" ok={CLIENT_ID_SET} />
              <ConfigRow label="ALPACA_CLIENT_SECRET" ok={CLIENT_SECRET_SET} />
            </div>

            {/* Redirect URI — must match exactly in the Alpaca portal */}
            <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1">
              <p className="text-xs text-zinc-500 font-medium">
                Redirect URI registered in your Alpaca OAuth app (must match exactly):
              </p>
              <code className="text-xs text-yellow-400 break-all">{REDIRECT_URI}</code>
            </div>

            <form
              action={async () => {
                "use server";
                await signIn("alpaca", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                disabled={!allConfigured}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Connect Alpaca Account
              </button>
            </form>

            {!allConfigured && (
              <p className="text-xs text-red-400">
                Add missing values to <code>.env.local</code> and restart the dev server.
              </p>
            )}

            <details className="text-xs text-zinc-600">
              <summary className="cursor-pointer hover:text-zinc-400 transition-colors select-none">
                Setup instructions
              </summary>
              <ol className="mt-3 space-y-1.5 list-decimal list-inside text-zinc-500 leading-relaxed">
                <li>Log in at <span className="text-zinc-400">app.alpaca.markets</span></li>
                <li>Go to <span className="text-zinc-400">Brokerage → Apps → OAuth Apps → Create New App</span></li>
                <li>Set <strong className="text-zinc-400">Redirect URI</strong> to the value shown above (exact match required)</li>
                <li>Set <strong className="text-zinc-400">Scopes</strong>: <code className="text-zinc-400">account:write trading</code></li>
                <li>Copy the <strong className="text-zinc-400">Client ID</strong> and <strong className="text-zinc-400">Client Secret</strong> into <code className="text-zinc-400">.env.local</code></li>
                <li>Restart the dev server (<code className="text-zinc-400">Ctrl+C</code> then <code className="text-zinc-400">npm run dev</code>)</li>
              </ol>
            </details>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">About</h2>
        <p className="text-sm text-zinc-500">
          Trading Assistant is a personal decision-support tool. All trade decisions rest with you.
          AI recommendations are for informational purposes only and are not investment advice.
        </p>
      </div>
    </div>
  );
}
