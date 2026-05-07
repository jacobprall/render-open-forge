import type { StreamEvent } from "@render-open-forge/shared";
import type { ResolvedSkill } from "@render-open-forge/skills";

export type { StreamEvent, ResolvedSkill };

export interface AgentJob {
  runId: string;
  chatId: string;
  sessionId: string;
  userId: string;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
  modelMessages?: unknown[];
  resolvedSkills: ResolvedSkill[];
  projectConfig?: unknown;
  projectContext?: string | null;
  modelId?: string;
  fixContext?: string;
  requestId?: string;
  retryCount?: number;
  maxRetries?: number;
  trigger?:
    | "user_message"
    | "ci_failure"
    | "review_comment"
    | "pr_opened"
    | "pr_merged"
    | "workflow_run";
}
