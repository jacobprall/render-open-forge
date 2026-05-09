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
    repoPath: string;
    branch: string;
    activeSkills: Array<{ source: "builtin" | "user" | "repo"; slug: string }> | null | undefined;
  },
  forge: ForgeProvider,
  forgeUsername: string,
): Promise<ResolvedSkill[]> {
  if (forgeUsername) {
    await ensureUserSkillsRepo(forge, forgeUsername);
  }

  const [owner, repo] = sessionRow.repoPath.split("/");
  const repoSlugs =
    owner && repo
      ? await listMdSlugsInRepoPath(forge, owner, repo, REPO_SKILLS_PATH, sessionRow.branch)
      : [];

  const active = normalizeActiveSkills(sessionRow.activeSkills, repoSlugs);
  const resolved = await resolveActiveSkills(forge, {
    activeSkills: active,
    forgeUsername,
    projectRepoPath: sessionRow.repoPath,
    ref: sessionRow.branch,
  });

  if (resolved.length === 0) {
    const fallback = getBuiltinRaw("implementation");
    if (fallback) {
      return [skillMarkdownToResolved("builtin", "implementation", fallback)];
    }
  }

  return resolved;
}
