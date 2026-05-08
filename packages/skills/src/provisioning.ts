import { createHash } from "node:crypto";
import type { ForgeProvider } from "@render-open-forge/shared/lib/forge/provider";
import {
  decodeForgeFileContent,
  getBuiltinRaw,
  loadBuiltinFiles,
  skillMarkdownToResolved,
} from "./builtins";
import { parseSkillMarkdown } from "./parse";
import { FORGE_SKILLS_REPO_NAME, USER_SKILLS_DIR, listMdSlugsInRepoPath } from "./resolve";

/** Shipped with full Vercel rule text; mirror into forge-skills whenever app builtins change. */
const FRAMEWORK_BUILTIN_SLUGS = ["react-best-practices", "next-best-practices"] as const;

const frameworkBuiltinSyncCache = new Map<string, string>();

function contentDigest(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Keep large framework skills on Forgejo in sync with app built-ins so the repo always has the full catalog.
 */
async function ensureFrameworkBuiltinMirrorFiles(
  forge: ForgeProvider,
  forgeUsername: string,
): Promise<void> {
  for (const slug of FRAMEWORK_BUILTIN_SLUGS) {
    const raw = getBuiltinRaw(slug);
    if (raw == null || !raw.trim()) continue;

    const digest = contentDigest(raw);
    const cacheKey = `${forgeUsername}:${slug}`;
    if (frameworkBuiltinSyncCache.get(cacheKey) === digest) continue;

    const path = `${USER_SKILLS_DIR}/${slug}.md`;

    try {
      const res = await forge.files.getContents(forgeUsername, FORGE_SKILLS_REPO_NAME, path);
      if (!Array.isArray(res) && res.type === "file") {
        const remote = decodeForgeFileContent(res.content, res.encoding);
        if (remote === raw) {
          frameworkBuiltinSyncCache.set(cacheKey, digest);
          continue;
        }
        await forge.files.putFile(forgeUsername, FORGE_SKILLS_REPO_NAME, path, {
          content: raw,
          message: `sync builtin: ${slug}`,
          sha: res.sha,
        });
      } else {
        await forge.files.createFile(forgeUsername, FORGE_SKILLS_REPO_NAME, path, {
          content: raw,
          message: `add builtin: ${slug}`,
        });
      }
      frameworkBuiltinSyncCache.set(cacheKey, digest);
    } catch {
      // Forgejo may be unavailable — resolution still uses built-in source when active.
    }
  }
}

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
  if (existing.length === 0) {
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

  await ensureFrameworkBuiltinMirrorFiles(forge, forgeUsername);
}

export function seedBuiltinSummariesForDocs(): ReturnType<typeof skillMarkdownToResolved>[] {
  return loadBuiltinFiles().map(({ slug, raw }) => skillMarkdownToResolved("builtin", slug, raw));
}
