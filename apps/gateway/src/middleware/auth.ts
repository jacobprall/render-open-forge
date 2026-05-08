/**
 * API-key authentication middleware for the gateway.
 *
 * Resolves a Bearer token to a platform AuthContext by looking up
 * the hashed key in the `api_keys` table, then loading the user's
 * Forgejo token from the linked account.
 *
 * Routes that don't need auth (health, webhooks) skip this middleware.
 */

import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { users, accounts, apiKeys } from "@openforge/db";
import type { AuthContext } from "@openforge/platform";
import { getPlatform } from "../platform";

export type GatewayEnv = {
  Variables: {
    auth: AuthContext;
  };
};

/**
 * Extract the bearer token from the Authorization header.
 * Accepts: `Bearer <token>` or raw `<token>`.
 */
function extractToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (!header) return null;
  return header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : header.trim();
}

function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Middleware: require a valid API key in the Authorization header.
 *
 * Resolution order:
 * 1. GATEWAY_API_SECRET shared secret (admin fallback for bootstrapping)
 * 2. Per-user hashed key lookup in the `api_keys` table
 */
export const requireApiAuth = createMiddleware<GatewayEnv>(async (c, next) => {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  const gatewaySecret = process.env.GATEWAY_API_SECRET;

  if (gatewaySecret && token === gatewaySecret) {
    const auth = await resolveAdminAuth();
    if (!auth) {
      return c.json({ error: "Admin user not configured" }, 503);
    }
    c.set("auth", auth);
    return next();
  }

  const auth = await resolveApiKeyAuth(token);
  if (!auth) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  c.set("auth", auth);
  return next();
});

async function resolveAdminAuth(): Promise<AuthContext | null> {
  const db = getPlatform().db;
  const [admin] = await db
    .select({
      id: users.id,
      forgejoUsername: users.forgejoUsername,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1);

  if (!admin) return null;

  const [account] = await db
    .select({ accessToken: accounts.access_token })
    .from(accounts)
    .where(
      and(eq(accounts.userId, admin.id), eq(accounts.provider, "forgejo")),
    )
    .limit(1);

  if (!account?.accessToken) return null;

  return {
    userId: admin.id,
    username: admin.forgejoUsername ?? "admin",
    forgeToken: account.accessToken,
    isAdmin: true,
  };
}

async function resolveApiKeyAuth(
  token: string,
): Promise<AuthContext | null> {
  const db = getPlatform().db;
  const hashed = hashApiKey(token);

  const [keyRow] = await db
    .select({ userId: apiKeys.userId, expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(eq(apiKeys.hashedKey, hashed))
    .limit(1);

  if (!keyRow) return null;

  if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      forgejoUsername: users.forgejoUsername,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, keyRow.userId))
    .limit(1);

  if (!user) return null;

  const [account] = await db
    .select({ accessToken: accounts.access_token })
    .from(accounts)
    .where(
      and(eq(accounts.userId, user.id), eq(accounts.provider, "forgejo")),
    )
    .limit(1);

  if (!account?.accessToken) return null;

  // Update last_used_at in background
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.hashedKey, hashed))
    .catch(() => {});

  return {
    userId: user.id,
    username: user.forgejoUsername ?? "unknown",
    forgeToken: account.accessToken,
    isAdmin: user.isAdmin ?? false,
  };
}
