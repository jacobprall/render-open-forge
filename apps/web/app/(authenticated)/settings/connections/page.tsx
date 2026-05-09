import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { syncConnections } from "@openforge/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Connections" };

const githubIcon = (
  <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const gitlabIcon = (
  <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
    <path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.382.859.859 0 0 0-.992.062.856.856 0 0 0-.284.404l-2.212 6.748H7.524L5.312 1.064a.856.856 0 0 0-.284-.404.859.859 0 0 0-.992-.062.852.852 0 0 0-.336.382L.433 9.502l-.032.09a6.013 6.013 0 0 0 1.996 6.954l.01.008.025.02 4.938 3.697 2.443 1.849 1.488 1.125a1.009 1.009 0 0 0 1.22 0l1.488-1.125 2.443-1.849 4.963-3.717.013-.01a6.015 6.015 0 0 0 1.994-6.946Z" />
  </svg>
);

const forgejoIcon = (
  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.777 0a2.9 2.9 0 0 1 2.193 4.773l-.009.01-1.199 1.4h1.467a2.896 2.896 0 0 1 2.206 4.784l-3.365 3.88.003.006a2.874 2.874 0 0 1-.721.678 4.823 4.823 0 0 1 .531 2.184v.138a4.823 4.823 0 0 1-9.613.39A6.17 6.17 0 0 1 2.558 24a6.172 6.172 0 0 1-2.1-11.975 6.382 6.382 0 0 1 .003-1.861 4.836 4.836 0 0 1 6.39-6.17l.166.062-.223-.339A2.91 2.91 0 0 1 9.271.002h.017l.025.001h.003a2.893 2.893 0 0 1 2.403 1.278l.103.176.01-.014A2.89 2.89 0 0 1 14.537.003h.024l.025.001h.009z" />
  </svg>
);

function providerIcon(id: string) {
  if (id === "github") return githubIcon;
  if (id === "gitlab") return gitlabIcon;
  return forgejoIcon;
}

function providerLabel(id: string) {
  if (id === "github") return "GitHub";
  if (id === "gitlab") return "GitLab";
  return "Forgejo";
}

export default async function ConnectionsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  let connections: typeof syncConnections.$inferSelect[] = [];
  try {
    const db = getDb();
    connections = await db
      .select()
      .from(syncConnections)
      .where(eq(syncConnections.userId, String(session.userId)));
  } catch {
    // DB might not be ready
  }

  const connectionMap = new Map<string, typeof syncConnections.$inferSelect>(
    connections.map((c) => [c.provider, c]),
  );

  const primaryForge = session.forgeType ?? "github";
  const primaryConnection = connectionMap.get(primaryForge);

  const additionalProviders = (["github", "gitlab", "forgejo"] as const).filter(
    (id) => id !== primaryForge,
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">Connections</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your forge connections for accessing and working with repositories.
        </p>
      </div>

      <div className="space-y-4">
        {/* Primary forge — connected via sign-in */}
        <div className="rounded-xl border border-accent/20 bg-zinc-900/50 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-accent-text">{providerIcon(primaryForge)}</div>
              <div>
                <h3 className="font-semibold text-zinc-100">{providerLabel(primaryForge)}</h3>
                <p className="text-sm text-zinc-400">
                  Primary forge — signed in via OAuth
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-sm font-medium text-accent-text">Connected</span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {primaryConnection?.remoteUsername ?? session.username}
              </p>
            </div>
          </div>
        </div>

        {/* Additional forge connections */}
        {additionalProviders.map((providerId) => {
          const connection = connectionMap.get(providerId);
          const hasOAuthRoute = providerId === "github";
          return (
            <div
              key={providerId}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-zinc-400">{providerIcon(providerId)}</div>
                  <div>
                    <h3 className="font-semibold text-zinc-100">{providerLabel(providerId)}</h3>
                    <p className="text-sm text-zinc-400">
                      Connect to access and mirror {providerLabel(providerId)} repositories
                    </p>
                  </div>
                </div>

                {connection ? (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        <span className="text-sm font-medium text-accent-text">Connected</span>
                      </div>
                      {connection.remoteUsername && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {connection.remoteUsername}
                        </p>
                      )}
                    </div>
                    <button
                      disabled
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : hasOAuthRoute ? (
                  <a
                    href={`/api/oauth/${providerId}`}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
                  >
                    Connect
                  </a>
                ) : (
                  <span className="text-xs text-zinc-600">Coming soon</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-zinc-600">
        Forge tokens are stored securely in the database. Manage your active mirrors in{" "}
        <a href="/settings/mirrors" className="text-accent-text hover:underline">Mirror Settings</a>.
      </p>
    </div>
  );
}
