import {
  ensureUserSkillsRepo,
  getBuiltinRaw,
  listMdSlugsInRepoPath,
  normalizeActiveSkills,
  resolveActiveSkills,
  REPO_SKILLS_PATH,
  skillMarkdownToResolved,
} from "@openforge/skills";
import type { ResolvedSkill } from "@openforge/skills";
import type { ForgeProvider } from "../forge/provider";

/**
 * Load ordered skill bodies for an agent job.
 * Mirrors the logic in apps/web/lib/skills/resolve-for-session.ts.
 */
export async function resolveSkillsForSession(
  sessionRow: {
    repoPath: string | null;
    branch: string | null;
    activeSkills: Array<{ source: "builtin" | "user" | "repo"; slug: string }> | null | undefined;
  },
  forge: ForgeProvider,
  forgeUsername: string,
): Promise<ResolvedSkill[]> {
  if (forgeUsername) {
    await ensureUserSkillsRepo(forge, forgeUsername);
  }

  const [owner, repo] = (sessionRow.repoPath ?? "").split("/");
  const branch = sessionRow.branch ?? "main";
  const repoSlugs =
    owner && repo
      ? await listMdSlugsInRepoPath(forge, owner, repo, REPO_SKILLS_PATH, branch)
      : [];

  const active = normalizeActiveSkills(sessionRow.activeSkills, repoSlugs);
  const resolved = await resolveActiveSkills(forge, {
    activeSkills: active,
    forgeUsername,
    projectRepoPath: sessionRow.repoPath ?? "",
    ref: branch,
  });

  if (resolved.length === 0) {
    const fallback = getBuiltinRaw("implementation");
    if (fallback) {
      return [skillMarkdownToResolved("builtin", "implementation", fallback)];
    }
  }

  return resolved;
}
