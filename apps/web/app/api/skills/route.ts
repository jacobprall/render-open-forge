import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import {
  ensureUserSkillsRepo,
  listBuiltinSummaries,
  listRepoSkillSummaries,
  listUserSkillSummaries,
} from "@render-open-forge/skills";

export async function GET(req: NextRequest) {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = req.nextUrl.searchParams.get("repo") ?? undefined;
  const forge = createForgeProvider(auth.forgejoToken);

  await ensureUserSkillsRepo(forge, auth.username);

  const builtins = listBuiltinSummaries();
  const user = await listUserSkillSummaries(forge, auth.username);
  const repoSkills = repo ? await listRepoSkillSummaries(forge, repo) : [];

  return NextResponse.json({ builtins, user, repo: repoSkills });
}
