import type { SessionPhase, WorkflowMode } from "./types";

interface SystemPromptOpts {
  phase: SessionPhase;
  workflowMode: WorkflowMode;
  projectContext?: string | null;
  projectConfig?: unknown;
}

const PHASE_INSTRUCTIONS: Record<SessionPhase, string> = {
  understand: `You are in the UNDERSTAND phase. Your goal is to deeply understand the user's request, ask clarifying questions, and explore the codebase to build context.`,
  spec: `You are in the SPEC phase. Produce a detailed technical specification as a JSON code block with fields: goal, approach, filesToModify, filesToCreate, risks, outOfScope, verificationPlan, estimatedComplexity.`,
  execute: `You are in the EXECUTE phase. Implement the requested changes. Write code, run tests, and iterate until the implementation is complete and correct.`,
  verify: `You are in the VERIFY phase. Run verification checks (tests, lint, typecheck) to validate the implementation.`,
  deliver: `You are in the DELIVER phase. Create a pull request with a clear title and description summarizing the changes.`,
  complete: `The task is complete.`,
  failed: `The previous attempt failed. Review the errors and try a different approach.`,
};

const WORKFLOW_MODE_INSTRUCTIONS: Record<WorkflowMode, string> = {
  full: "Follow the full workflow: understand → spec → execute → verify → deliver.",
  standard: "Follow the standard workflow: execute → verify → deliver. Skip understand and spec unless the task is ambiguous.",
  fast: "Execute quickly with minimal verification. Skip spec. Only verify if critical.",
  yolo: "Execute immediately. No verification. Push and create PR directly.",
};

export function buildAgentSystemPrompt(opts: SystemPromptOpts): string {
  const parts: string[] = [];

  parts.push(`You are an AI software engineer working in a self-hosted forge environment (Forgejo-based). You have full access to the repository via your tools.`);

  parts.push(`\n## Workflow Mode\n${WORKFLOW_MODE_INSTRUCTIONS[opts.workflowMode]}`);
  parts.push(`\n## Current Phase\n${PHASE_INSTRUCTIONS[opts.phase]}`);

  parts.push(`\n## Tools Available
- bash: Execute shell commands
- read_file / write_file / edit: File operations
- glob / grep: Search and find files
- git: Git operations (push/pull/fetch have automatic forge authentication)
- create_pull_request: Open a PR on the internal forge
- web_fetch: Fetch URLs from the internet
- task: Delegate subtasks to a focused subagent
- todo_write: Manage a task list
- ask_user_question: Ask the user for clarification`);

  parts.push(`\n## Important Notes
- All git operations target the internal Forgejo instance. Authentication is automatic.
- When creating a PR, push your branch first with the git tool, then use create_pull_request.
- The repository is already cloned in your workspace. Use glob/grep to explore it.
- Write clean, well-structured code. Don't add unnecessary comments.`);

  if (opts.projectContext) {
    parts.push(`\n## Project Context\n${opts.projectContext}`);
  }

  if (opts.projectConfig && typeof opts.projectConfig === "object") {
    const config = opts.projectConfig as Record<string, unknown>;
    if (config.instructions && typeof config.instructions === "string") {
      parts.push(`\n## Project Instructions\n${config.instructions}`);
    }
  }

  return parts.join("\n");
}
