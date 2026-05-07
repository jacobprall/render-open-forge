import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { listRepoSkillSummaries } from "@render-open-forge/skills";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const repoPath = path.join("/");
  if (!repoPath.includes("/")) {
    return NextResponse.json({ error: "Invalid repo path" }, { status: 400 });
  }

  const forge = createForgeProvider(auth.forgejoToken);
  const repoSkills = await listRepoSkillSummaries(forge, repoPath);
  return NextResponse.json({ repo: repoPath, skills: repoSkills });
}
