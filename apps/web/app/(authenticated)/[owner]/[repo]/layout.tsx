import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo } = await params;

  const client = createForgejoClient(session.forgejoToken);
  let repoData;
  try {
    repoData = await client.getRepo(owner, repo);
  } catch {
    notFound();
  }

  const basePath = `/${owner}/${repo}`;
  const tabs = [
    { label: "Code", href: basePath },
    { label: "Commits", href: `${basePath}/commits/${repoData.default_branch}` },
    { label: "Pull Requests", href: `${basePath}/pulls` },
    { label: "CI", href: `${basePath}/actions` },
    { label: "Settings", href: `${basePath}/settings` },
  ];

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="mb-4 flex items-center gap-3">
            <svg
              className="h-5 w-5 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
              />
            </svg>
            <div className="flex items-center gap-1.5 text-lg">
              <Link
                href={`/${owner}`}
                className="font-medium text-emerald-400 hover:underline"
              >
                {owner}
              </Link>
              <span className="text-zinc-500">/</span>
              <Link
                href={basePath}
                className="font-semibold text-emerald-400 hover:underline"
              >
                {repo}
              </Link>
            </div>
            {repoData.private ? (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                Private
              </span>
            ) : (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                Public
              </span>
            )}
          </div>

          <nav className="-mb-px flex gap-0">
            {tabs.map((tab) => (
              <Link
                key={tab.label}
                href={tab.href}
                className="border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </div>
  );
}
