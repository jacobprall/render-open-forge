import type { ForgeProvider } from "@render-open-forge/shared/lib/forge";
import { loadBuiltinFiles, skillMarkdownToResolved } from "./builtins";
import { parseSkillMarkdown } from "./parse";
import { FORGE_SKILLS_REPO_NAME, USER_SKILLS_DIR, listMdSlugsInRepoPath } from "./resolve";

/**
 * Ensure `{username}/forge-skills` exists and seed `skills/*.md` from built-ins when empty.
 */
export async function ensureUserSkillsRepo(
  forge: ForgeProvider,
  forgeUsername: string,
): Promise<void> {
  try {
    await forge.repos.get(forgeUsername, FORGE_SKILLS_REPO_NAME);
  } catch {
    await forge.repos.create({
      name: FORGE_SKILLS_REPO_NAME,
      description: "Personal agent skills (markdown + frontmatter)",
      isPrivate: true,
      autoInit: true,
      defaultBranch: "main",
    });
  }

  const existing = await listMdSlugsInRepoPath(
    forge,
    forgeUsername,
    FORGE_SKILLS_REPO_NAME,
    USER_SKILLS_DIR,
  );
  if (existing.length > 0) return;

  for (const { slug, raw } of loadBuiltinFiles()) {
    const path = `${USER_SKILLS_DIR}/${slug}.md`;
    const p = parseSkillMarkdown(raw);
    try {
      await forge.files.createFile(forgeUsername, FORGE_SKILLS_REPO_NAME, path, {
        content: raw,
        message: `seed skill: ${p.name || slug}`,
      });
    } catch {
      // File may already exist from a partial previous seed — skip it.
    }
  }
}

export function seedBuiltinSummariesForDocs(): ReturnType<typeof skillMarkdownToResolved>[] {
  return loadBuiltinFiles().map(({ slug, raw }) => skillMarkdownToResolved("builtin", slug, raw));
}
