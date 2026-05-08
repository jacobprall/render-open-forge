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
