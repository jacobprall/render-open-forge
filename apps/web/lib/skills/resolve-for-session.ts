import type { sessions } from "@openforge/db";
import type { ForgeProvider } from "@openforge/platform/forge";
import {
  ensureUserSkillsRepo,
  getBuiltinRaw,
  listMdSlugsInRepoPath,
  normalizeActiveSkills,
  resolveActiveSkills,
  REPO_SKILLS_PATH,
  skillMarkdownToResolved,
  type ResolvedSkill,
} from "@openforge/skills";

type SessionSkillsInput = Pick<
  typeof sessions.$inferSelect,
  "repoPath" | "branch" | "activeSkills"
>;

/**
 * Load ordered skill bodies for an agent job (user OAuth or agent token).
 */
export async function resolveSkillsForSessionRow(
  sessionRow: SessionSkillsInput,
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
