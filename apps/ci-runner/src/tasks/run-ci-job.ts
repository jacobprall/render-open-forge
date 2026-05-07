import { task } from "@renderinc/sdk/workflows";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { CIJobInput, CIJobResult, StepResult } from "../types";
import { appendCombinedOutput } from "../lib/combined-output";
import { cloneRepo, executeStep } from "../lib/step-executor";
import { scanForTestResults } from "../lib/result-parser";

export const runCIJob = task(
  {
    name: "runCIJob",
    timeoutSeconds: 3600,
    plan: "standard",
    retry: {
      maxRetries: 1,
      waitDurationMs: 5000,
      backoffScaling: 2,
    },
  },
  async function runCIJob(input: CIJobInput): Promise<CIJobResult> {
    const totalStart = Date.now();
    const workDir = mkdtempSync(join(tmpdir(), "ci-"));

    try {
      const cloneResult = await cloneRepo(input.cloneUrl, input.branch, workDir);
      if (cloneResult.exitCode !== 0) {
        const result: CIJobResult = {
          ciEventId: input.ciEventId,
          workflowName: input.workflowName,
          status: "error",
          jobs: [],
          totalDurationMs: Date.now() - totalStart,
        };
        await postCallback(input, result);
        return result;
      }

      const jobResults: CIJobResult["jobs"] = [];
      let overallStatus: CIJobResult["status"] = "success";
      let combinedOutput = "";

      for (const job of input.jobs) {
        const jobStart = Date.now();
        const stepResults: StepResult[] = [];
        let jobStatus: "success" | "failure" | "error" = "success";

        for (const step of job.steps) {
          const sr = await executeStep(step, workDir);
          stepResults.push(sr);
          combinedOutput = appendCombinedOutput(combinedOutput, sr.stdout, sr.stderr);

          if (sr.exitCode !== 0) {
            jobStatus = "failure";
            overallStatus = "failure";
            break; // stop job on first failed step
          }
        }

        jobResults.push({
          name: job.name,
          status: jobStatus,
          steps: stepResults,
          durationMs: Date.now() - jobStart,
        });

        if (jobStatus === "failure") break; // stop all jobs on first failure
      }

      const testResults = scanForTestResults(workDir, combinedOutput);

      const result: CIJobResult = {
        ciEventId: input.ciEventId,
        workflowName: input.workflowName,
        status: overallStatus,
        jobs: jobResults,
        testResults: (testResults.junitXml || testResults.tapOutput) ? testResults : undefined,
        totalDurationMs: Date.now() - totalStart,
      };

      await postCallback(input, result);
      return result;
    } catch (err) {
      const result: CIJobResult = {
        ciEventId: input.ciEventId,
        workflowName: input.workflowName,
        status: "error",
        jobs: [],
        totalDurationMs: Date.now() - totalStart,
      };
      await postCallback(input, result);
      return result;
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    }
  },
);

async function postCallback(input: CIJobInput, result: CIJobResult): Promise<void> {
  if (!input.callbackUrl) return;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (input.callbackSecret) {
      headers["X-CI-Secret"] = input.callbackSecret;
    }

    const res = await fetch(input.callbackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[ci-runner] Callback failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("[ci-runner] Callback error:", err);
  }
}
