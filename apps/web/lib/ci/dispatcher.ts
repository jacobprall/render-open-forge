import type { ForgeProvider } from "@render-open-forge/shared/lib/forge";
import { ciEvents } from "@render-open-forge/db";
import { eq } from "drizzle-orm";
import { logger } from "@render-open-forge/shared";
import type { ForgeDb } from "@/lib/db";
import { parseWorkflowYaml, shouldTrigger, type ParsedWorkflow } from "./workflow-parser";

const CI_RUNNER_MODE = process.env.CI_RUNNER_MODE ?? "render";

/** Lazy singleton — avoids constructing a new SDK client per webhook workflow. */
let renderWorkflowClient: import("@renderinc/sdk").Render | null = null;

async function getRenderWorkflowClient(): Promise<import("@renderinc/sdk").Render> {
  if (!renderWorkflowClient) {
    const { Render } = await import("@renderinc/sdk");
    renderWorkflowClient = new Render();
  }
  return renderWorkflowClient;
}

export interface DispatchResult {
  ciEventId: string;
  dispatched: boolean;
  error?: string;
}

/**
 * Read workflow files from a repo, check trigger conditions, and dispatch
 * CI jobs to Render Workflows. Posts a pending commit status to Forgejo.
 */
export async function dispatchCIForEvent(
  db: ForgeDb,
  forge: ForgeProvider,
  params: {
    repoOwner: string;
    repoName: string;
    branch: string;
    commitSha: string;
    event: "push" | "pull_request";
    sessionId: string;
  },
): Promise<DispatchResult[]> {
  const { repoOwner, repoName, branch, commitSha, event, sessionId } = params;
  const results: DispatchResult[] = [];

  let workflows: ParsedWorkflow[];
  try {
    workflows = await readWorkflowsFromRepo(forge, repoOwner, repoName, branch);
  } catch (err) {
    logger.warn("ci dispatch: failed to read workflows", {
      repo: `${repoOwner}/${repoName}`,
      cause: err instanceof Error ? err.message : String(err),
    });
    return results;
  }

  if (workflows.length === 0) return results;

  const triggeredWorkflows = workflows.filter((w) => shouldTrigger(w, event, branch));
  if (triggeredWorkflows.length === 0) return results;

  const cloneUrl = forge.git.authenticatedCloneUrl(repoOwner, repoName);
  const callbackUrl = buildCallbackUrl();
  const callbackSecret = process.env.CI_RUNNER_SECRET;

  for (const workflow of triggeredWorkflows) {
    const ciEventId = crypto.randomUUID();

    try {
      await db.insert(ciEvents).values({
        id: ciEventId,
        sessionId,
        type: "ci_running",
        workflowName: workflow.name,
        status: "running",
        payload: {
          workflow: workflow.name,
          jobs: workflow.jobs.map((j) => j.name),
          commitSha,
        },
        processed: false,
      });

      await forge.commits.createStatus(repoOwner, repoName, commitSha, {
        state: "pending",
        context: `ci/${workflow.name}`,
        description: "CI running via Render Workflows",
      }).catch((err) => {
        logger.warn("ci dispatch: failed to post pending status", {
          cause: err instanceof Error ? err.message : String(err),
        });
      });

      const input = {
        cloneUrl,
        branch,
        commitSha,
        workflowName: workflow.name,
        jobs: workflow.jobs.map((j) => ({
          name: j.name,
          steps: j.steps,
        })),
        callbackUrl,
        callbackSecret,
        ciEventId,
      };

      if (CI_RUNNER_MODE === "local") {
        await dispatchLocal(input);
      } else {
        await dispatchToRenderWorkflows(input);
      }

      results.push({ ciEventId, dispatched: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.errorWithCause(err, "ci dispatch: failed to dispatch workflow", {
        workflow: workflow.name,
      });

      await db
        .update(ciEvents)
        .set({
          status: "error",
          type: "ci_failure",
          payload: {
            error: msg,
            workflow: workflow.name,
            jobs: workflow.jobs.map((j) => j.name),
            commitSha,
          },
        })
        .where(eq(ciEvents.id, ciEventId))
        .catch(() => {});

      await forge.commits.createStatus(repoOwner, repoName, commitSha, {
        state: "error",
        context: `ci/${workflow.name}`,
        description: `Dispatch failed: ${msg.slice(0, 100)}`,
      }).catch(() => {});

      results.push({ ciEventId, dispatched: false, error: msg });
    }
  }

  return results;
}

async function readWorkflowsFromRepo(
  forge: ForgeProvider,
  owner: string,
  repo: string,
  ref: string,
): Promise<ParsedWorkflow[]> {
  const workflowDir = ".forgejo/workflows";
  let entries: Array<{ name: string; path: string; type: string }>;

  try {
    const contents = await forge.files.getContents(owner, repo, workflowDir, ref);
    if (!Array.isArray(contents)) return [];
    entries = contents;
  } catch {
    return [];
  }

  const workflows: ParsedWorkflow[] = [];

  for (const entry of entries) {
    if (entry.type !== "file") continue;
    if (!entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;

    try {
      const file = await forge.files.getContents(owner, repo, entry.path, ref);
      if (Array.isArray(file) || !file.content) continue;

      const decoded = file.encoding === "base64"
        ? Buffer.from(file.content, "base64").toString("utf-8")
        : file.content;

      const parsed = parseWorkflowYaml(decoded, entry.name);
      if (parsed) workflows.push(parsed);
    } catch {
      // skip malformed files
    }
  }

  return workflows;
}

async function dispatchToRenderWorkflows(input: Record<string, unknown>): Promise<void> {
  const render = await getRenderWorkflowClient();
  const workflowSlug = process.env.RENDER_CI_WORKFLOW_SLUG ?? "forge-ci";
  await render.workflows.startTask(`${workflowSlug}/runCIJob`, [input]);
}

async function dispatchLocal(input: Record<string, unknown>): Promise<void> {
  const { executeLocalCIJob } = await import("@/lib/ci/local-runner");
  void executeLocalCIJob(input);
}

function buildCallbackUrl(): string {
  const base = process.env.CI_CALLBACK_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? "http://localhost:4000";
  return `${base}/api/ci/results`;
}
