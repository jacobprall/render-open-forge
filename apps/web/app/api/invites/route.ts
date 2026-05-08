import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { invites, users, accounts } from "@render-open-forge/db/schema";
import { createInviteToken, generateSecurePassword } from "@/lib/auth/invite-tokens";
import { createForgejoApiTokenForUser } from "@/lib/forgejo/create-api-token";

const FORGEJO_INTERNAL_URL =
  process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";

const createInviteSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username must be alphanumeric, hyphens, or underscores"),
  email: z.string().email().optional(),
});

async function createForgejoUser(
  username: string,
  password: string,
  email: string,
): Promise<{ id: number; login: string }> {
  const agentToken = process.env.FORGEJO_AGENT_TOKEN;
  if (!agentToken) throw new Error("FORGEJO_AGENT_TOKEN not configured");

  const res = await fetch(`${FORGEJO_INTERNAL_URL}/api/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${agentToken}`,
    },
    body: JSON.stringify({
      username,
      password,
      email,
      must_change_password: false,
      login_name: username,
      source_id: 0,
      visibility: "public",
    }),
  });

  if (res.status === 422) {
    const body = await res.text();
    throw new Error(`Forgejo user "${username}" already exists: ${body}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Forgejo user: ${res.status} ${body}`);
  }

  return res.json() as Promise<{ id: number; login: string }>;
}

/**
 * POST /api/invites — Create an invite for a new user.
 *
 * Provisions Forgejo (headless), a pre-created app user row, a Forgejo API
 * token in `accounts`, and a signed invite URL for setting a password.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, email } = parsed.data;
  const userEmail = (email ?? `${username}@open-forge.local`).toLowerCase();

  const db = getDb();

  try {
    const forgejoBootstrapPassword = generateSecurePassword();
    const forgejoUser = await createForgejoUser(
      username,
      forgejoBootstrapPassword,
      userEmail,
    );

    const { token: forgejoToken, profile } =
      await createForgejoApiTokenForUser(forgejoUser.login, forgejoBootstrapPassword);

    const invitedUserId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteId = crypto.randomUUID();
    const token = createInviteToken(inviteId, expiresAt);

    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: invitedUserId,
        name: profile.full_name || profile.login,
        email: userEmail,
        image: profile.avatar_url,
        forgejoUserId: profile.id,
        forgejoUsername: profile.login,
      });

      await tx.insert(accounts).values({
        userId: invitedUserId,
        type: "oauth",
        provider: "forgejo",
        providerAccountId: String(profile.id),
        access_token: forgejoToken,
      });

      await tx.insert(invites).values({
        id: inviteId,
        email: userEmail,
        forgejoUsername: username,
        invitedUserId,
        token,
        createdBy: session.userId,
        expiresAt,
      });
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
    const inviteUrl = `${appUrl}/invite/accept?token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      inviteUrl,
      username,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/invites — List pending invites for the current user. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: invites.id,
      email: invites.email,
      forgejoUsername: invites.forgejoUsername,
      expiresAt: invites.expiresAt,
      redeemedAt: invites.redeemedAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(eq(invites.createdBy, session.userId))
    .orderBy(desc(invites.createdAt));

  return NextResponse.json({ invites: rows });
}
