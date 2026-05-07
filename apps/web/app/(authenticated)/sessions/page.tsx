import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Terminal, Plus } from "lucide-react";
import { PageShell, Button, EmptyState } from "@/components/primitives";
import { SessionCard } from "./session-card";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();
  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, String(session.userId)))
    .orderBy(desc(sessions.createdAt));

  return (
    <PageShell
      title="Sessions"
      description="Your agent coding sessions"
      actions={
        <Button variant="primary" asChild>
          <Link href="/sessions/new">New Session</Link>
        </Button>
      }
    >
      {userSessions.length === 0 ? (
        <EmptyState
          icon={<Terminal className="h-6 w-6" />}
          title="No sessions yet."
          description="Start a new session to have an AI agent work on your code."
          action={
            <Button variant="primary" asChild>
              <Link href="/sessions/new">
                <Plus className="h-4 w-4" />
                Create your first session
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {userSessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
