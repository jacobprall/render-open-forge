/**
 * Pluggable CI dispatcher interface.
 *
 * Decouples CI job dispatch from the specific execution backend.
 * The default implementation uses Render Workflows; alternatives
 * could use GitHub Actions, GitLab CI, local shell execution, etc.
 */

export interface CIJobInput {
  ciEventId: string;
  repoCloneUrl: string;
  branch: string;
  commitSha: string;
  workflowName: string;
  jobs: Array<{
    name: string;
    steps: Array<{ name: string; run: string }>;
  }>;
  callbackUrl: string;
  callbackSecret: string;
  /** Additional env vars to inject into CI steps. */
  env?: Record<string, string>;
}

export interface CIDispatcher {
  /**
   * Dispatch a CI job to the execution backend.
   * Should not throw on dispatch failure — return a result indicating success/failure.
   */
  dispatch(input: CIJobInput): Promise<CIDispatchResult>;
}

export type CIDispatchResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Render Workflows implementation
// ---------------------------------------------------------------------------

export class RenderWorkflowsDispatcher implements CIDispatcher {
  private clientPromise: Promise<import("@renderinc/sdk").Render> | null = null;

  private getClient(): Promise<import("@renderinc/sdk").Render> {
    if (!this.clientPromise) {
      this.clientPromise = import("@renderinc/sdk").then(
        ({ Render }) => new Render(),
      );
    }
    return this.clientPromise;
  }

  async dispatch(input: CIJobInput): Promise<CIDispatchResult> {
    try {
      const render = await this.getClient();
      const slug =
        process.env.RENDER_CI_WORKFLOW_SLUG ?? "openforge-ci";
      await render.workflows.startTask(`${slug}/runCIJob`, [input]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// No-op implementation (for tests or when CI dispatch is disabled)
// ---------------------------------------------------------------------------

export class NoopCIDispatcher implements CIDispatcher {
  public dispatched: CIJobInput[] = [];

  async dispatch(input: CIJobInput): Promise<CIDispatchResult> {
    this.dispatched.push(input);
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Local in-process implementation (for development without Render)
// ---------------------------------------------------------------------------

export class LocalCIDispatcher implements CIDispatcher {
  async dispatch(input: CIJobInput): Promise<CIDispatchResult> {
    try {
      const { mkdtempSync, rmSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { spawn } = await import("child_process");

      const workDir = mkdtempSync(join(tmpdir(), "ci-local-"));
      const totalStart = Date.now();

      const run = async (cmd: string, args: string[], cwd: string) => {
        const start = Date.now();
        return new Promise<{ exitCode: number; stdout: string; stderr: string; name: string; durationMs: number }>((resolve) => {
          const child = spawn(cmd, args, {
            cwd,
            env: { ...process.env, CI: "true", GIT_TERMINAL_PROMPT: "0" },
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 600_000,
          });
          const out: Buffer[] = [];
          const err: Buffer[] = [];
          child.stdout.on("data", (c: Buffer) => out.push(c));
          child.stderr.on("data", (c: Buffer) => err.push(c));
          child.on("error", (e) => resolve({ exitCode: 1, stdout: "", stderr: e.message, name: args.join(" ").slice(0, 60), durationMs: Date.now() - start }));
          child.on("close", (code) => resolve({
            exitCode: code ?? 1,
            stdout: Buffer.concat(out).toString("utf-8").slice(0, 512_000),
            stderr: Buffer.concat(err).toString("utf-8").slice(0, 512_000),
            name: args.join(" ").slice(0, 60),
            durationMs: Date.now() - start,
          }));
        });
      };

      const branch = input.branch || "main";
      const cloneResult = await run("git", ["clone", "--depth", "50", "--branch", branch, input.repoCloneUrl, workDir], "/tmp");

      if (cloneResult.exitCode !== 0) {
        await this.postCallback(input, { ciEventId: input.ciEventId, workflowName: input.workflowName, status: "error", jobs: [], totalDurationMs: Date.now() - totalStart });
        rmSync(workDir, { recursive: true, force: true });
        return { ok: true };
      }

      const jobResults: Array<{ name: string; status: string; steps: Array<{ name: string; exitCode: number; stdout: string; stderr: string; durationMs: number }>; durationMs: number }> = [];
      let overallStatus: "success" | "failure" = "success";

      for (const job of input.jobs) {
        const jobStart = Date.now();
        const steps: Array<{ name: string; exitCode: number; stdout: string; stderr: string; durationMs: number }> = [];
        let jobStatus: "success" | "failure" = "success";

        for (const step of job.steps) {
          const sr = await run("bash", ["-euo", "pipefail", "-c", step.run], workDir);
          sr.name = step.name || step.run.slice(0, 60);
          steps.push(sr);
          if (sr.exitCode !== 0) { jobStatus = "failure"; overallStatus = "failure"; break; }
        }

        jobResults.push({ name: job.name, status: jobStatus, steps, durationMs: Date.now() - jobStart });
        if (jobStatus === "failure") break;
      }

      await this.postCallback(input, {
        ciEventId: input.ciEventId,
        workflowName: input.workflowName,
        status: overallStatus,
        jobs: jobResults,
        totalDurationMs: Date.now() - totalStart,
      });
      rmSync(workDir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async postCallback(input: CIJobInput, result: Record<string, unknown>): Promise<void> {
    if (!input.callbackUrl) return;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (input.callbackSecret) headers["X-CI-Secret"] = input.callbackSecret;
    await fetch(input.callbackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {});
  }
}
