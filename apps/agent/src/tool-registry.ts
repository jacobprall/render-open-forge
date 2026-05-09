import type { LanguageModel, ToolSet } from "ai";
import type Redis from "ioredis";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { specs } from "@openforge/db";
import type { PlatformDb, EventBus } from "@openforge/platform";
import {
  bashTool,
  readFileTool,
  writeFileTool,
  globTool,
  grepTool,
  gitTool,
  createPullRequestTool,
  editFileTool,
  webFetchTool,
  taskTool,
  todoWriteTool,
  askUserQuestionTool,
  mergePrTool,
  closePrTool,
  addPrCommentTool,
  requestReviewTool,
  approvePrTool,
  createRepoTool,
  readBuildLogTool,
  pullRequestDiffTool,
  reviewPrTool,
  resolveCommentTool,
  submitSpecTool,
  type SubmitSpecInput,
  renderListServicesTool,
  renderDeployTool,
  renderGetDeployStatusTool,
  renderGetLogsTool,
  renderListEnvVarsTool,
  renderSetEnvVarsTool,
  renderGetServiceTool,
  renderCreateServiceTool,
  renderListPostgresTool,
  renderCreatePostgresTool,
  renderCreateRedisTool,
  renderGetPostgresConnectionTool,
  renderProjectStatusTool,
  renderCreatePreviewTool,
  renderDeletePreviewTool,
} from "./tools";
import type { AgentJob, StreamEvent } from "./types";
import { publishEvent } from "./run-persistence";

// ─── Tool registry ───────────────────────────────────────────────────────────

export function buildSubagentToolSet(db?: PlatformDb): ToolSet {
  return {
    bash: bashTool(),
    read_file: readFileTool(),
    write_file: writeFileTool(),
    edit: editFileTool(),
    glob: globTool(),
    grep: grepTool(),
    git: gitTool(),
    create_pull_request: createPullRequestTool(),
    web_fetch: webFetchTool(),
    ...(process.env.RENDER_API_KEY
      ? {
          render_list_services: renderListServicesTool(),
          render_deploy: renderDeployTool(db),
          render_get_deploy_status: renderGetDeployStatusTool(),
          render_get_logs: renderGetLogsTool(),
          render_list_env_vars: renderListEnvVarsTool(),
          render_set_env_vars: renderSetEnvVarsTool(db),
          render_get_service: renderGetServiceTool(),
          render_create_service: renderCreateServiceTool(db),
          render_list_postgres: renderListPostgresTool(),
          render_create_postgres: renderCreatePostgresTool(db),
          render_create_redis: renderCreateRedisTool(db),
          render_get_postgres_connection: renderGetPostgresConnectionTool(),
          render_project_status: renderProjectStatusTool(db),
          render_create_preview: renderCreatePreviewTool(db),
          render_delete_preview: renderDeletePreviewTool(db),
        }
      : {}),
  };
}

export function buildToolSet(
  events: EventBus,
  redis: Redis,
  db: PlatformDb,
  job: AgentJob,
  model: LanguageModel,
  skillsPromptSuffix: string,
): ToolSet {
  const reqId = job.requestId;
  const makeSubTools = () => buildSubagentToolSet(db);
  return {
    ...makeSubTools(),
    task: taskTool(
      async (event) => {
        await publishEvent(events, job.runId, event as unknown as StreamEvent, reqId);
      },
      makeSubTools,
      model,
      skillsPromptSuffix,
    ),
    todo_write: todoWriteTool(),
    ask_user_question: askUserQuestionTool(job.runId, () => redis.duplicate(), async (event) => {
      await publishEvent(events, job.runId, event as unknown as StreamEvent, reqId);
    }),
    merge_pr: mergePrTool(),
    close_pr: closePrTool(),
    add_pr_comment: addPrCommentTool(),
    request_review: requestReviewTool(),
    approve_pr: approvePrTool(),
    create_repo: createRepoTool(),
    read_build_log: readBuildLogTool(),
    pull_request_diff: pullRequestDiffTool(),
    review_pr: reviewPrTool(),
    resolve_comment: resolveCommentTool(),
    submit_spec: submitSpecTool(
      async (event) => {
        await publishEvent(events, job.runId, event, reqId);
      },
      async (spec) => {
        await persistSubmittedSpec(db, job.sessionId, spec);
      },
    ),
  };
}

async function persistSubmittedSpec(db: PlatformDb, sessionId: string, spec: SubmitSpecInput): Promise<void> {
  const [latest] = await db
    .select()
    .from(specs)
    .where(eq(specs.sessionId, sessionId))
    .orderBy(desc(specs.version))
    .limit(1);

  await db.insert(specs).values({
    id: nanoid(),
    sessionId,
    version: (latest?.version ?? 0) + 1,
    status: "draft",
    goal: spec.goal,
    approach: spec.approach,
    filesToModify: spec.filesToModify ?? [],
    filesToCreate: spec.filesToCreate ?? [],
    risks: spec.risks ?? [],
    outOfScope: spec.outOfScope ?? [],
    verificationPlan: spec.verificationPlan,
    estimatedComplexity: spec.estimatedComplexity ?? "small",
    createdAt: new Date(),
  });
}
