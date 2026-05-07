import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { invites, users } from "@render-open-forge/db/schema";
import { verifyInviteToken } from "@/lib/auth/invite-tokens";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

const BCRYPT_ROUNDS = 12;

/**
 * POST /api/auth/invite/accept
 *
 * Validates the signed invite, sets the user's password for the first time,
 * marks the invite redeemed. The client must then call credentials signIn.
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { token: rawToken, password } = parsed.data;

  const signed = verifyInviteToken(rawToken);
  if (!signed) {
    return NextResponse.json(
      { error: "Invalid or expired invite token" },
      { status: 400 },
    );
  }

  const db = getDb();

  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, signed.inviteId), isNull(invites.redeemedAt)))
    .limit(1);

  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found or already used" },
      { status: 400 },
    );
  }

  if (new Date() > invite.expiresAt) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
  }

  const [invitedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, invite.invitedUserId))
    .limit(1);

  if (!invitedUser) {
    return NextResponse.json({ error: "Invited user record missing" }, { status: 500 });
  }

  if (invitedUser.passwordHash) {
    return NextResponse.json(
      { error: "This invite was already completed; sign in instead." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, invitedUser.id));

    await tx
      .update(invites)
      .set({ redeemedAt: new Date(), redeemedBy: invitedUser.id })
      .where(eq(invites.id, invite.id));
  });

  return NextResponse.json({
    ok: true as const,
    email: invitedUser.email,
  });
}
