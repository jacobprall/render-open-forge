import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  accounts,
  verificationTokens,
} from "@render-open-forge/db/schema";
import { credentialsProvider } from "./providers/credentials";

declare module "next-auth" {
  interface Session {
    forgejoToken: string;
    forgejoUserId: number;
    forgejoUsername: string;
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
    forgejoToken?: string;
    forgejoUserId?: number;
    forgejoUsername?: string;
    isAdmin?: boolean;
  }
}

async function loadForgejoAccessTokenForUser(
  userId: string,
): Promise<string | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ accessToken: accounts.access_token })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "forgejo")))
    .limit(1);
  return row?.accessToken ?? undefined;
}

const config: NextAuthConfig = {
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),

  session: { strategy: "jwt" },

  providers: [credentialsProvider],

  pages: {
    signIn: "/",
    error: "/",
  },

  trustHost: true,

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const accessToken = await loadForgejoAccessTokenForUser(user.id);
        token.forgejoToken = accessToken;
        token.forgejoUserId = user.forgejoUserId ?? undefined;
        token.forgejoUsername = user.forgejoUsername ?? undefined;
        token.isAdmin = user.isAdmin ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.forgejoToken = token.forgejoToken ?? "";
      session.forgejoUserId = token.forgejoUserId ?? 0;
      session.forgejoUsername = token.forgejoUsername ?? "";
      session.isAdmin = token.isAdmin ?? false;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
