import { getDb } from "@/lib/db";
import { sessions, chats, chatMessages } from "@openforge/db";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";

type Part =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown };

export default async function SharedSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .then((rows) => rows[0] ?? null);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-0 text-text-primary">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Session not found</h1>
          <p className="mt-2 text-text-tertiary">
            This session may not exist or is not shared.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-accent-text hover:text-accent"
          >
            Go home
          </Link>
        </div>
      </main>
    );
  }

  const chatRows = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, id))
    .then((rows) => rows[0] ?? null);

  const messages = chatRows
    ? await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.chatId, chatRows.id))
        .orderBy(asc(chatMessages.createdAt))
    : [];

  const statusColors: Record<string, string> = {
    running: "bg-accent-bg text-accent-text border-accent/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    failed: "bg-danger/10 text-danger border-danger/20",
    archived: "bg-surface-2 text-text-tertiary border-stroke-subtle",
  };

  return (
    <main className="min-h-screen bg-surface-0 text-text-primary">
      <header className="border-b border-stroke-subtle px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-text-tertiary hover:text-text-primary"
            >
              OpenForge
            </Link>
            <span className="text-text-tertiary">/</span>
            <span className="text-sm text-text-tertiary">shared session</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <h1 className="text-xl font-bold">{session.title}</h1>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[session.status] ?? statusColors.archived}`}
            >
              {session.status}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-text-tertiary">
            <span>{session.repoPath}</span>
            <span className="text-text-tertiary">·</span>
            <span>{session.branch}</span>
            <span className="text-text-tertiary">·</span>
            <span>
              Skills:{" "}
              {(session.activeSkills?.length
                ? session.activeSkills.map((x) => x.slug).join(", ")
                : "default")}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        {messages.length === 0 ? (
          <div className="border border-stroke-subtle p-12 text-center">
            <p className="text-text-tertiary">No messages in this session yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const parts = (msg.parts ?? []) as Part[];
              return (
                <div
                  key={msg.id}
                  className={`border p-4 ${
                    msg.role === "user"
                      ? "border-stroke-default bg-surface-1"
                      : "border-stroke-subtle bg-surface-0"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        msg.role === "user"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-accent-bg text-accent-text"
                      }`}
                    >
                      {msg.role}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <div key={i} className="whitespace-pre-wrap text-sm text-text-primary">
                            {part.text}
                          </div>
                        );
                      }
                      if (part.type === "tool-call") {
                        return (
                          <div
                            key={i}
                            className="border border-stroke-default bg-surface-1 px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-warning">
                              {part.toolName}
                            </span>
                            <pre className="mt-1 overflow-x-auto text-text-tertiary">
                              {JSON.stringify(part.args, null, 2)}
                            </pre>
                          </div>
                        );
                      }
                      if (part.type === "tool-result") {
                        return (
                          <div
                            key={i}
                            className="border border-stroke-default bg-surface-1 px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-accent-text">
                              Result: {part.toolName}
                            </span>
                            <pre className="mt-1 max-h-40 overflow-auto text-text-tertiary">
                              {typeof part.result === "string"
                                ? part.result
                                : JSON.stringify(part.result, null, 2)}
                            </pre>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-sm text-text-tertiary">
            This is a read-only view of a shared agent session.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm text-accent-text hover:text-accent"
          >
            Sign in to create your own sessions
          </Link>
        </div>
      </div>
    </main>
  );
}
