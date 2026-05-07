import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createForgejoClient } from "@/lib/forgejo/client";
import Link from "next/link";

export default async function ReposPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const client = createForgejoClient(session.forgejoToken);
  const repos = await client.listUserRepos().catch(() => []);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Repositories</h1>
          <p className="text-sm text-zinc-400">Welcome, {session.username}</p>
        </div>
        <Link
          href="/repos/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          New Repository
        </Link>
      </div>

      {repos.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-12 text-center">
          <p className="text-zinc-400">No repositories yet.</p>
          <p className="mt-2 text-sm text-zinc-500">
            Create a new repo or import one from GitHub/GitLab.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              href={`/${repo.full_name}`}
              className="block rounded-lg border border-zinc-800 p-4 transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{repo.full_name}</span>
                  {repo.private && (
                    <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                      private
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500">{repo.default_branch}</span>
              </div>
              {repo.description && (
                <p className="mt-1 text-sm text-zinc-400">{repo.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
