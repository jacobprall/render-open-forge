# @render-open-forge/skills

Skill system for OpenForge's AI agent. Handles skill types, resolution, parsing, provisioning, and ships a set of built-in skills.

## What is a skill?

A skill is a Markdown file with YAML frontmatter that shapes agent behavior for a task session. Frontmatter fields include `name`, `description`, and `default` (whether the skill is active by default). The Markdown body is injected into the agent's system prompt.

```markdown
---
name: Code quality
description: Clean structure, naming, and minimal noise
default: "false"
---

Write clean, well-structured code. Prefer clear names and small, focused functions.
```

## Skill sources

Skills are loaded from three sources (defined by `SkillSource`):

| Source | Location | Description |
|--------|----------|-------------|
| **builtin** | `packages/skills/builtins/` | Ship with the platform; available to every user |
| **user** | Per-user Forgejo repo (`forge-skills`) | Personal skills synced across all projects |
| **repo** | `.forge/skills/*.md` in any project repo | Project-specific skills, version-controlled with the code |

## Built-in skills

| Skill | File |
|-------|------|
| Code quality | `code-quality.md` |
| Implementation | `implementation.md` |
| Implement | `implement.md` |
| Next.js best practices | `next-best-practices.md` |
| PR delivery | `pr-delivery.md` |
| React best practices | `react-best-practices.md` |
| Refactor | `refactor.md` |
| Spec-first | `spec-first.md` |
| Supabase / Postgres | `supabase-postgres.md` |
| Thorough understanding | `thorough-understanding.md` |
| Verification | `verification.md` |

## Key exports

- **Types** — `SkillSource`, `ActiveSkillRef`, `ResolvedSkill`, `SkillSummary`, `ParsedSkillFile`
- **Parsing** — `parseSkillMarkdown()` splits a `.md` file into frontmatter + body
- **Built-ins** — `loadBuiltinFiles()`, `listBuiltinSummaries()`, `getBuiltinRaw()`, `BUILTINS_DIR`
- **Resolution** — `resolveActiveSkills()` takes a list of `ActiveSkillRef`s and returns fully resolved skill content ready for the system prompt. Helpers: `listRepoSkillSummaries()`, `listUserSkillSummaries()`, `normalizeActiveSkills()`, `DEFAULT_ACTIVE_SKILL_REFS`
- **Provisioning** — `ensureUserSkillsRepo()` creates the per-user Forgejo skills repo on first use; `seedBuiltinSummariesForDocs()` populates it with built-in summaries
