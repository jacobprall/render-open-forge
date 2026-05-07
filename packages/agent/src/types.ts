import type { SessionPhase, WorkflowMode } from "@render-open-forge/db";
import type { StreamEvent } from "@render-open-forge/shared";

export type { SessionPhase, WorkflowMode };
export type { StreamEvent };

export interface AgentJob {
  runId: string;
  chatId: string;
  sessionId: string;
  userId: string;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
  modelMessages?: unknown[];
  phase: SessionPhase;
  workflowMode: WorkflowMode;
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
