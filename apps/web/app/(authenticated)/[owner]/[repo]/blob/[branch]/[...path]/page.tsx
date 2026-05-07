import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import type { ForgeFileContent } from "@render-open-forge/shared/lib/forge/types";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { formatBytes } from "@/lib/utils";
import { CopyButton } from "@/components/repo/copy-button";

export default async function BlobPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; branch: string; path: string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo, branch: rawBranch, path: pathSegments } = await params;
  const branch = decodeURIComponent(rawBranch);
  const filePath = pathSegments.join("/");
  const fileName = pathSegments[pathSegments.length - 1];
  const forge = createForgeProvider(session.forgejoToken);

  let fileData: ForgeFileContent;
  try {
    const result = await forge.files.getContents(owner, repo, filePath, branch);
    if (Array.isArray(result)) {
      redirect(
        `/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${filePath}`,
      );
      return;
    }
    fileData = result;
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    notFound();
  }

  let content = "";
  if (fileData.content && fileData.encoding === "base64") {
    content = Buffer.from(fileData.content, "base64").toString("utf-8");
  } else if (fileData.content) {
    content = fileData.content;
  }

  const lines = content.split("\n");

  const breadcrumbs = pathSegments.reduce<
    { label: string; href: string }[]
  >((acc, segment, i) => {
    if (i < pathSegments.length - 1) {
      const href = `/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${pathSegments.slice(0, i + 1).join("/")}`;
      acc.push({ label: segment, href });
    } else {
      acc.push({ label: segment, href: "" });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <Link
          href={`/${owner}/${repo}`}
          className="text-accent-text hover:underline"
        >
          {repo}
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-zinc-600">/</span>
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-accent-text hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-zinc-200">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* File viewer */}
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        {/* File header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <svg
              className="h-4 w-4 text-zinc-500"
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
            <span className="text-sm font-medium text-zinc-200">
              {fileName}
            </span>
            <span className="text-xs text-zinc-500">
              {formatBytes(fileData.size)}
            </span>
            <span className="text-xs text-zinc-600">
              {lines.length} lines
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton content={content} />
            <a
              href={`/${owner}/${repo}/raw/${encodeURIComponent(branch)}/${filePath}`}
              className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              Raw
            </a>
          </div>
        </div>

        {/* Code content */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-zinc-900/30">
                  <td className="w-1 select-none border-r border-zinc-800/50 px-3 py-0 text-right align-top font-mono text-xs leading-5 text-zinc-600">
                    {i + 1}
                  </td>
                  <td className="px-4 py-0 align-top">
                    <pre className="font-mono text-sm leading-5 text-zinc-300">
                      {line || " "}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
