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
import { eq, and } from "drizzle-orm";
import { users, accounts } from "@render-open-forge/db";
import type { AuthContext } from "@render-open-forge/platform";
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

/**
 * Middleware: require a valid API key in the Authorization header.
 *
 * For the initial implementation we use a simple shared secret
 * (`GATEWAY_API_SECRET`) that maps to the admin user. This will be
 * replaced with per-user API key table lookups once the key management
 * surface is exposed through the gateway itself.
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
  _token: string,
): Promise<AuthContext | null> {
  // TODO: Look up hashed token in an api_keys table, resolve to user.
  // For now, only the shared GATEWAY_API_SECRET is supported.
  return null;
}
