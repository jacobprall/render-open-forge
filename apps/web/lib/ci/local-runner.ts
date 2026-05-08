/**
 * Local-mode CI runner for development.
 * Delegates execution to `@openforge/ci-runner` libs (same as Render Workflows task).
 */

import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { appendCombinedOutput } from "@openforge/ci-runner/lib/combined-output";
import { cloneRepo, executeStep } from "@openforge/ci-runner/lib/step-executor";
import { scanForTestResults } from "@openforge/ci-runner/lib/result-parser";
import { logger } from "@openforge/shared";

interface CIInput {
  cloneUrl: string;
  branch: string;
  commitSha: string;
  workflowName: string;
  jobs: Array<{
    name: string;
    steps: Array<{ name?: string; run: string; env?: Record<string, string> }>;
  }>;
  callbackUrl?: string;
  callbackSecret?: string;
  ciEventId: string;
}

export async function executeLocalCIJob(raw: Record<string, unknown>): Promise<void> {
  const input = raw as unknown as CIInput;
  const totalStart = Date.now();
  const workDir = mkdtempSync(join(tmpdir(), "ci-local-"));

  try {
    const cloneResult = await cloneRepo(input.cloneUrl, input.branch, workDir);
    if (cloneResult.exitCode !== 0) {
      await postResult(input, {
        ciEventId: input.ciEventId,
        workflowName: input.workflowName,
        status: "error",
        jobs: [],
        totalDurationMs: Date.now() - totalStart,
      });
      return;
    }

    const jobResults: Array<{
      name: string;
      status: "success" | "failure" | "error";
      steps: Array<{
        name: string;
        exitCode: number;
        stdout: string;
        stderr: string;
        durationMs: number;
      }>;
      durationMs: number;
    }> = [];
    let overallStatus: "success" | "failure" | "error" = "success";
    let combinedOutput = "";

    for (const job of input.jobs) {
      const jobStart = Date.now();
      const stepResults: typeof jobResults[0]["steps"] = [];
      let jobStatus: "success" | "failure" | "error" = "success";

      for (const step of job.steps) {
        const sr = await executeStep(step, workDir);
        stepResults.push(sr);
        combinedOutput = appendCombinedOutput(combinedOutput, sr.stdout, sr.stderr);

        if (sr.exitCode !== 0) {
          jobStatus = "failure";
          overallStatus = "failure";
          break;
        }
      }

      jobResults.push({
        name: job.name,
        status: jobStatus,
        steps: stepResults,
        durationMs: Date.now() - jobStart,
      });

      if (jobStatus === "failure") break;
    }

    const testResults = scanForTestResults(workDir, combinedOutput);

    await postResult(input, {
      ciEventId: input.ciEventId,
      workflowName: input.workflowName,
      status: overallStatus,
      jobs: jobResults,
      testResults: (testResults.junitXml || testResults.tapOutput) ? testResults : undefined,
      totalDurationMs: Date.now() - totalStart,
    });
  } catch (err) {
    logger.errorWithCause(err, "local ci runner failed", { ciEventId: input.ciEventId });
    await postResult(input, {
      ciEventId: input.ciEventId,
      workflowName: input.workflowName,
      status: "error",
      jobs: [],
      totalDurationMs: Date.now() - totalStart,
    });
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
}

async function postResult(input: CIInput, result: Record<string, unknown>): Promise<void> {
  if (!input.callbackUrl) return;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (input.callbackSecret) headers["X-CI-Secret"] = input.callbackSecret;
    await fetch(input.callbackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.warn("local ci runner: callback failed", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
