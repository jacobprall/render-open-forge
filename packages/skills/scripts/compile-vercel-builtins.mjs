/**
 * Merges Vercel Cursor skills under .cursor/skills/ into single builtin markdown
 * files so Forgejo seeding and workers get full rule text.
 *
 * Run from repo root: bun run --filter @openforge/skills compile-vercel-builtins
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _pkgRoot = join(_scriptDir, "..");
const _repoRoot = join(_pkgRoot, "..", "..");

const CURSOR = join(_repoRoot, ".cursor", "skills");
const OUT_DIR = join(_pkgRoot, "builtins");

function stripSkillFrontmatter(raw) {
  const t = raw.trim();
  if (!t.startsWith("---\n")) return { metaRest: "", body: t };
  const end = t.indexOf("\n---\n", 4);
  if (end === -1) return { metaRest: "", body: t };
  return { metaRest: t.slice(4, end).trim(), body: t.slice(end + 5).trim() };
}

/** @type {readonly string[]} */
const NEXT_PARTS = [
  "file-conventions.md",
  "rsc-boundaries.md",
  "async-patterns.md",
  "runtime-selection.md",
  "directives.md",
  "functions.md",
  "error-handling.md",
  "data-patterns.md",
  "route-handlers.md",
  "metadata.md",
  "image.md",
  "font.md",
  "bundling.md",
  "scripts.md",
  "hydration-error.md",
  "suspense-boundaries.md",
  "parallel-routes.md",
  "self-hosting.md",
  "debug-tricks.md",
];

function buildReactBuiltin() {
  const agentsPath = join(CURSOR, "react-best-practices", "AGENTS.md");
  const agents = readFileSync(agentsPath, "utf8").trim();
  const header = `---
name: React Best Practices
description: React and Next.js performance optimization guidelines from Vercel Engineering — eliminating waterfalls, bundle size, server-side performance, client-side data fetching, re-render optimization, rendering performance, JavaScript performance, and advanced patterns. Full compiled rules with incorrect/correct examples (from vercel-labs/agent-skills).
default: "true"
---

`;
  writeFileSync(join(OUT_DIR, "react-best-practices.md"), `${header}${agents}\n`);
}

function buildNextBuiltin() {
  const skillPath = join(CURSOR, "next-best-practices", "SKILL.md");
  const skillRaw = readFileSync(skillPath, "utf8");
  const { body: skillBody } = stripSkillFrontmatter(skillRaw);

  const chunks = [
    `---
name: Next.js Best Practices
description: Next.js best practices from Vercel — file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/font optimization, bundling, hydration errors, suspense, parallel routes, self-hosting. Full text from vercel-labs/next-skills.
default: "true"
---

# Next.js Best Practices

${skillBody.trim()}

---

# Reference sections (full text)

`,
  ];

  const base = join(CURSOR, "next-best-practices");
  for (const file of NEXT_PARTS) {
    const partPath = join(base, file);
    const raw = readFileSync(partPath, "utf8");
    const { body } = stripSkillFrontmatter(raw);
    const title = file.replace(/\.md$/i, "").replace(/-/g, " ");
    chunks.push(`\n## ${title}\n\n${body.trim()}\n`);
  }

  writeFileSync(join(OUT_DIR, "next-best-practices.md"), chunks.join(""));
}

buildReactBuiltin();
buildNextBuiltin();
console.log("Wrote builtins/react-best-practices.md and builtins/next-best-practices.md");
