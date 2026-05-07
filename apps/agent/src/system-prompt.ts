import type { ResolvedSkill } from "@render-open-forge/skills";

export type { ResolvedSkill };

interface SystemPromptOpts {
  skills: ResolvedSkill[];
  projectContext?: string | null;
  projectConfig?: unknown;
}

export function buildAgentSystemPrompt(opts: SystemPromptOpts): string {
  const parts: string[] = [];

  parts.push(
    `You are an AI software engineer working in a self-hosted forge environment (Forgejo-based). You have full access to the repository via your tools.`,
  );

  const skillBlocks = opts.skills.map((s) => s.content).filter(Boolean);
  if (skillBlocks.length > 0) {
    parts.push(`\n## Skills & instructions\n\n${skillBlocks.join("\n\n---\n\n")}`);
  }

  parts.push(`\n## Tools available
- bash: Execute shell commands
- read_file / write_file / edit: File operations
- glob / grep: Search and find files
- git: Git operations (push/pull/fetch have automatic forge authentication)
- create_pull_request: Open a PR on the internal forge
- web_fetch: Fetch URLs from the internet
- task: Delegate subtasks to a focused subagent
- todo_write: Manage a task list
- ask_user_question: Ask the user for clarification`);

  parts.push(`\n## Important notes
- All git operations target the internal Forgejo instance. Authentication is automatic.
- When creating a PR, push your branch first with the git tool, then use create_pull_request.
- The repository is already cloned in your workspace. Use glob/grep to explore it.`);

  if (opts.projectContext) {
    parts.push(`\n## Project context\n${opts.projectContext}`);
  }

  if (opts.projectConfig && typeof opts.projectConfig === "object") {
    const config = opts.projectConfig as Record<string, unknown>;
    if (config.instructions && typeof config.instructions === "string") {
      parts.push(`\n## Project instructions\n${config.instructions}`);
    }
  }

  return parts.join("\n");
}
