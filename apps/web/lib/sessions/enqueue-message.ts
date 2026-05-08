import type Redis from "ioredis";
import type { ResolvedSkill } from "@render-open-forge/skills";
import { enqueueJob, ensureConsumerGroup } from "@render-open-forge/platform";

export type EnqueueAgentChatMessage = {
  role: "user" | "assistant";
  content: unknown;
};

export type EnqueueAgentMessageParams = {
  redis: Redis;
  runId: string;
  chatId: string;
  sessionId: string;
  userId: string;
  messages: EnqueueAgentChatMessage[];
  resolvedSkills: ResolvedSkill[];
  projectConfig?: unknown | null;
  projectContext?: string | null;
  modelId: string;
  requestId: string;
};

/** Ensure stream group exists and enqueue a user-message agent job. */
export async function enqueueAgentMessage(
  params: EnqueueAgentMessageParams,
): Promise<void> {
  const {
    redis,
    runId,
    chatId,
    sessionId,
    userId,
    messages,
    resolvedSkills,
    projectConfig,
    projectContext,
    modelId,
    requestId,
  } = params;

  await ensureConsumerGroup(redis);
  await enqueueJob(redis, {
    runId,
    chatId,
    sessionId,
    userId,
    messages,
    resolvedSkills,
    projectConfig: projectConfig ?? undefined,
    projectContext: projectContext ?? undefined,
    modelId,
    requestId,
    maxRetries: 3,
  });
}
