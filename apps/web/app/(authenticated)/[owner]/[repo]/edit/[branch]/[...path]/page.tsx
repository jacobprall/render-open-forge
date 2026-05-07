import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import { FileEditor } from "./file-editor";

interface PageProps {
  params: Promise<{ owner: string; repo: string; branch: string; path: string[] }>;
}

export default async function EditFilePage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo, branch, path } = await params;
  const filePath = path.join("/");
  const client = createForgejoClient(session.forgejoToken);

  let content = "";
  let sha = "";
  let isNew = false;

  try {
    const file = await client.getContents(owner, repo, filePath, branch);
    if (!Array.isArray(file) && file.content) {
      content = Buffer.from(file.content, "base64").toString("utf-8");
      sha = file.sha;
    }
  } catch {
    isNew = true;
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-2 text-lg font-semibold text-zinc-100">
        {isNew ? "New File" : "Edit File"}
      </h1>
      <p className="mb-4 text-sm text-zinc-400">
        {owner}/{repo}/{filePath} (branch: {branch})
      </p>
      <FileEditor
        owner={owner}
        repo={repo}
        branch={branch}
        filePath={filePath}
        initialContent={content}
        sha={sha}
        isNew={isNew}
      />
    </div>
  );
}
