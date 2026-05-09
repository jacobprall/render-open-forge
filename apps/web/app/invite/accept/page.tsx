import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invites, users } from "@openforge/db/schema";
import { verifyInviteToken } from "@/lib/auth/invite-tokens";
import { InvitePasswordForm } from "./invite-password-form";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InviteAcceptPage({ searchParams }: PageProps) {
  const { token: raw } = await searchParams;

  if (!raw) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-text-tertiary">Missing invite link. Ask your admin for a new invite.</p>
        <Link href="/" className="mt-4 text-sm text-accent-text hover:underline">
          Back to home
        </Link>
      </main>
    );
  }

  const signed = verifyInviteToken(raw);
  if (!signed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-center text-text-tertiary">
          This invite link is invalid or has expired.
        </p>
        <Link href="/" className="mt-4 text-sm text-accent-text hover:underline">
          Back to home
        </Link>
      </main>
    );
  }

  const db = getDb();

  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, signed.inviteId), isNull(invites.redeemedAt)))
    .limit(1);

  if (!invite) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-center text-text-tertiary">
          This invite has already been used or does not exist.
        </p>
        <Link href="/" className="mt-4 text-sm text-accent-text hover:underline">
          Sign in
        </Link>
      </main>
    );
  }

  if (new Date() > invite.expiresAt) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-center text-text-tertiary">This invite has expired.</p>
        <Link href="/" className="mt-4 text-sm text-accent-text hover:underline">
          Back to home
        </Link>
      </main>
    );
  }

  const [invitedUser] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, invite.invitedUserId))
    .limit(1);

  if (invitedUser?.passwordHash) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-center text-text-tertiary">
          You have already set a password for this account.
        </p>
        <Link
          href="/"
          className="mt-6 bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Set a password for your OpenForge account.
        </p>
        <InvitePasswordForm token={raw} />
        <p className="mt-8 text-xs text-text-tertiary">
          Wrong person?{" "}
          <Link href="/" className="text-accent-text hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
