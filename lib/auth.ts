import NextAuth, { type NextAuthConfig } from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { clientPromise, getCollections } from "@/lib/db/mongodb";
import { encrypt } from "@/lib/utils/encryption";

const AlpacaProvider = {
  id: "alpaca",
  name: "Alpaca Markets",
  type: "oauth" as const,
  authorization: {
    url: "https://app.alpaca.markets/oauth/authorize",
    params: {
      scope: "account:write trading",
      response_type: "code",
    },
  },
  token: "https://api.alpaca.markets/oauth/token",
  userinfo: "https://api.alpaca.markets/v2/account",
  clientId: process.env.ALPACA_CLIENT_ID,
  clientSecret: process.env.ALPACA_CLIENT_SECRET,
  profile(profile: Record<string, unknown>) {
    return {
      id: String(profile.id ?? profile.account_number),
      email: String(profile.email ?? ""),
      name: String(profile.account_number ?? ""),
      alpacaAccountId: String(profile.id ?? profile.account_number),
    };
  },
};

export const authConfig: NextAuthConfig = {
  adapter: MongoDBAdapter(clientPromise, { databaseName: "trading-assistant" }),
  providers: [AlpacaProvider],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as typeof session.user & { id: string }).id = user.id;
      }
      return session;
    },
    async signIn({ account, user }) {
      if (account?.provider === "alpaca" && account.access_token) {
        try {
          const { users } = await getCollections();
          const encryptedToken = encrypt(account.access_token);
          const encryptedRefresh = account.refresh_token
            ? encrypt(account.refresh_token)
            : "";
          const expiresAt = account.expires_at
            ? new Date(account.expires_at * 1000)
            : null;

          await users.updateOne(
            { email: user.email ?? "" },
            {
              $set: {
                alpacaOAuthToken: encryptedToken,
                alpacaRefreshToken: encryptedRefresh,
                alpacaTokenExpiresAt: expiresAt,
                updatedAt: new Date(),
              },
              $setOnInsert: {
                alpacaAccountId: account.providerAccountId,
                riskProfile: {
                  maxPositionSizePct: 5,
                  defaultStopLossPct: 2,
                  roiTargetMonthlyPct: 25,
                  optionsApprovalLevel: 1,
                },
                preferences: {
                  tipsEnabled: true,
                  learningModeEnabled: true,
                  aiEnabled: true,
                },
                watchlist: [],
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
        } catch (err) {
          console.error("[auth] Failed to store Alpaca token:", err);
          return false;
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/settings",
    error: "/settings",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
