import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  accounts,
  syncConnections,
  verificationTokens,
} from "@openforge/db/schema";
import { credentialsProvider } from "./providers/credentials";

declare module "next-auth" {
  interface Session {
    forgeToken: string;
    forgeUserId: number;
    forgeUsername: string;
    forgeType: "forgejo" | "github" | "gitlab";
    isAdmin: boolean;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    forgejoUserId?: number | null;
    forgejoUsername?: string | null;
    isAdmin?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    forgeToken?: string;
    forgeUserId?: number;
    forgeUsername?: string;
    forgeType?: "forgejo" | "github" | "gitlab";
    isAdmin?: boolean;
  }
}

/**
 * Resolve a forge access token for the user by checking providers in order:
 * forgejo first, then github.
 */
async function loadForgeAccessTokenForUser(
  userId: string,
): Promise<{ token: string; forgeType: "forgejo" | "github" | "gitlab"; username?: string } | undefined> {
  const db = getDb();

  const providerOrder: Array<"forgejo" | "github" | "gitlab"> = ["forgejo", "github", "gitlab"];
  for (const provider of providerOrder) {
    const [row] = await db
      .select({ accessToken: accounts.access_token, providerAccountId: accounts.providerAccountId })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)))
      .limit(1);
    if (row?.accessToken) {
      return { token: row.accessToken, forgeType: provider, username: row.providerAccountId };
    }
  }
  return undefined;
}

/**
 * When a user signs in via GitHub OAuth, ensure a syncConnections row exists
 * so the agent can resolve their token for GitHub-direct sessions.
 */
async function ensureSyncConnection(
  userId: string,
  provider: string,
  accessToken: string,
  username: string,
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: syncConnections.id })
    .from(syncConnections)
    .where(and(eq(syncConnections.userId, userId), eq(syncConnections.provider, provider)))
    .limit(1);

  if (existing) {
    await db
      .update(syncConnections)
      .set({ accessToken, remoteUsername: username || null })
      .where(eq(syncConnections.id, existing.id));
  } else {
    await db.insert(syncConnections).values({
      id: crypto.randomUUID(),
      userId,
      provider,
      accessToken,
      refreshToken: null,
      expiresAt: null,
      remoteUsername: username || null,
    });
  }
}

const githubProvider = GitHub({
  clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
  clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
  authorization: { params: { scope: "read:user user:email repo" } },
});

const providers: NextAuthConfig["providers"] = [credentialsProvider];
if (process.env.GITHUB_OAUTH_CLIENT_ID) {
  providers.push(githubProvider);
}

const config: NextAuthConfig = {
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),

  session: { strategy: "jwt" },

  providers,

  pages: {
    signIn: "/",
    error: "/",
  },

  trustHost: true,

  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user?.id) {
        const forgeInfo = await loadForgeAccessTokenForUser(user.id);
        token.forgeToken = forgeInfo?.token;
        token.forgeType = forgeInfo?.forgeType ?? "forgejo";
        token.forgeUserId = user.forgejoUserId ?? undefined;
        token.isAdmin = user.isAdmin ?? false;

        // Resolve username: GitHub profile login > Forgejo username > user name
        const ghLogin = (profile as { login?: string } | undefined)?.login;
        token.forgeUsername = ghLogin ?? user.forgejoUsername ?? user.name ?? undefined;

        if (account?.provider === "github" && account.access_token) {
          await ensureSyncConnection(
            user.id,
            "github",
            account.access_token,
            token.forgeUsername ?? "",
          ).catch(() => {});
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.forgeToken = token.forgeToken ?? "";
      session.forgeUserId = token.forgeUserId ?? 0;
      session.forgeUsername = token.forgeUsername ?? "";
      session.forgeType = token.forgeType ?? "forgejo";
      session.isAdmin = token.isAdmin ?? false;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
