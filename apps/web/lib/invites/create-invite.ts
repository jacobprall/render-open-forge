import { invites, users, accounts } from "@openforge/db/schema";
import { createInviteToken, generateSecurePassword } from "@/lib/auth/invite-tokens";
import { createForgejoApiTokenForUser } from "@/lib/forge/create-api-token";
import type { ForgeDb } from "@/lib/db";

const FORGEJO_INTERNAL_URL =
  process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";

export async function createForgejoUser(
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

export type CreateInviteParams = {
  username: string;
  email?: string;
  /** Session user performing the invite (stored as `createdBy`). */
  userId: string;
  db: ForgeDb;
};

export async function createInvite(
  params: CreateInviteParams,
): Promise<{ inviteUrl: string; username: string; expiresAt: Date }> {
  const { username, userId, db } = params;
  const userEmail = (params.email ?? `${username}@open-forge.local`).toLowerCase();

  const forgejoBootstrapPassword = generateSecurePassword();
  const forgejoUser = await createForgejoUser(
    username,
    forgejoBootstrapPassword,
    userEmail,
  );

  const { token: forgejoToken, profile } = await createForgejoApiTokenForUser(
    forgejoUser.login,
    forgejoBootstrapPassword,
  );

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
      createdBy: userId,
      expiresAt,
    });
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
  const inviteUrl = `${appUrl}/invite/accept?token=${encodeURIComponent(token)}`;

  return { inviteUrl, username, expiresAt };
}
