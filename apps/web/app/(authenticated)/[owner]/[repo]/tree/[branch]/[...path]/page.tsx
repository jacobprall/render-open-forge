import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import type { ForgeFileContent } from "@openforge/platform/forge/types";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { formatBytes } from "@/lib/utils";
import { BranchSelector } from "@/components/repo/branch-selector";

export default async function TreePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; branch: string; path: string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo, branch: rawBranch, path: pathSegments } = await params;
  const branch = decodeURIComponent(rawBranch);
  const currentPath = pathSegments.join("/");
  const forge = createForgeProvider(session.forgeToken, session.forgeType);

  let contents: ForgeFileContent[];
  let branches;
  try {
    const [contentsResult, branchesResult] = await Promise.all([
      forge.files.getContents(owner, repo, currentPath, branch),
      forge.branches.list(owner, repo).catch(() => []),
    ]);
    branches = branchesResult;
    const raw = contentsResult;
    if (Array.isArray(raw)) {
      contents = raw;
    } else if (raw.type === "dir") {
      notFound();
    } else {
      redirect(
        `/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${currentPath}`,
      );
      return;
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    notFound();
  }

  const sorted = [...contents].sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });

  const breadcrumbs = pathSegments.reduce<
    { label: string; href: string }[]
  >((acc, segment, i) => {
    const href = `/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${pathSegments.slice(0, i + 1).join("/")}`;
    acc.push({ label: segment, href });
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      {/* Branch selector + breadcrumbs */}
      <div className="flex flex-wrap items-center gap-3">
        <BranchSelector
          branches={branches}
          currentBranch={branch}
          owner={owner}
          repo={repo}
        />
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={`/${owner}/${repo}`}
            className="text-accent-text hover:underline"
          >
            {repo}
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1">
              <span className="text-text-tertiary">/</span>
              {i === breadcrumbs.length - 1 ? (
                <span className="font-medium text-text-primary">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-accent-text hover:underline"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      {/* File listing */}
      <div className="overflow-hidden border border-stroke-subtle">
        {/* Parent directory link */}
        <Link
          href={
            pathSegments.length <= 1
              ? `/${owner}/${repo}`
              : `/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${pathSegments.slice(0, -1).join("/")}`
          }
          className="flex items-center gap-3 border-b border-stroke-subtle px-4 py-2 text-sm text-text-tertiary transition-colors duration-(--of-duration-instant) hover:bg-surface-1 hover:text-text-primary"
        >
          <svg
            className="h-4 w-4 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m11.25 9-3 3m0 0 3 3m-3-3h7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          ..
        </Link>
        <div className="divide-y divide-stroke-subtle">
          {sorted.map((file) => (
            <Link
              key={file.path}
              href={
                file.type === "dir"
                  ? `/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${file.path}`
                  : `/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${file.path}`
              }
              className="flex items-center gap-3 px-4 py-2 transition-colors duration-(--of-duration-instant) hover:bg-surface-1"
            >
              {file.type === "dir" ? (
                <svg
                  className="h-4 w-4 shrink-0 text-accent-text"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 shrink-0 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              )}
              <span className="text-sm text-text-primary">{file.name}</span>
              {file.type === "file" && (
                <span className="ml-auto text-xs text-text-tertiary">
                  {formatBytes(file.size)}
                </span>
              )}
            </Link>
          ))}
          {sorted.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              This directory is empty
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
