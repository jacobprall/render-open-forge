import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import { FileEditor } from "./file-editor";

interface PageProps {
  params: Promise<{ owner: string; repo: string; branch: string; path: string[] }>;
}

export default async function EditFilePage({ params }: PageProps) {
  const [session, resolvedParams] = await Promise.all([getSession(), params]);
  if (!session) redirect("/");

  const { owner, repo, branch, path } = resolvedParams;
  const filePath = path.join("/");
  const forge = createForgeProvider(session.forgeToken, session.forgeType);

  let content = "";
  let sha = "";
  let isNew = false;

  try {
    const file = await forge.files.getContents(owner, repo, filePath, branch);
    if (!Array.isArray(file) && file.content) {
      content = Buffer.from(file.content, "base64").toString("utf-8");
      sha = file.sha;
    }
  } catch {
    isNew = true;
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-2 text-lg font-semibold text-text-primary">
        {isNew ? "New File" : "Edit File"}
      </h1>
      <p className="mb-4 text-sm text-text-tertiary">
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
