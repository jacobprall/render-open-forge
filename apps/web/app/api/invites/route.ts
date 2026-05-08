import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { invites } from "@render-open-forge/db/schema";
import { createInvite } from "@/lib/invites/create-invite";

const createInviteSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username must be alphanumeric, hyphens, or underscores"),
  email: z.string().email().optional(),
});

/** POST /api/invites — Forgejo user, app row, token, signed accept URL. */
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
  const db = getDb();
  try {
    const { inviteUrl, username, expiresAt } = await createInvite({
      db,
      userId: session.userId,
      username: parsed.data.username,
      email: parsed.data.email,
    });
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
