import { spawn } from "child_process";
import type { StepResult } from "../types";

const MAX_OUTPUT_BYTES = 512_000; // 500 KB per stream

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const marker = `\n…[truncated ${s.length - max} bytes]…\n`;
  return s.slice(0, max) + marker;
}

const BASE_CI_ENV = { CI: "true", RENDER_CI: "true" } as const;

export async function runSpawn(
  command: string,
  args: string[],
  cwd: string,
  stepName: string,
  stepEnv?: Record<string, string>,
): Promise<StepResult> {
  const start = Date.now();

  return new Promise<StepResult>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...BASE_CI_ENV,
        GIT_TERMINAL_PROMPT: "0",
        ...stepEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600_000, // 10 min per step
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
      }
    });

    child.on("error", (err) => {
      resolve({
        name: stepName,
        exitCode: 1,
        stdout: "",
        stderr: err.message,
        durationMs: Date.now() - start,
      });
    });

    child.on("close", (code) => {
      resolve({
        name: stepName,
        exitCode: code ?? 1,
        stdout: truncate(Buffer.concat(stdoutChunks).toString("utf-8"), MAX_OUTPUT_BYTES),
        stderr: truncate(Buffer.concat(stderrChunks).toString("utf-8"), MAX_OUTPUT_BYTES),
        durationMs: Date.now() - start,
      });
    });
  });
}

export async function executeStep(
  step: { name?: string; run: string; env?: Record<string, string> },
  cwd: string,
): Promise<StepResult> {
  const name = step.name ?? step.run.slice(0, 60);
  return runSpawn("bash", ["-euo", "pipefail", "-c", step.run], cwd, name, step.env);
}

/**
 * Clone repo using argv (no shell) to avoid injection via branch or URL.
 */
export async function cloneRepo(
  cloneUrl: string,
  branch: string,
  targetDir: string,
): Promise<StepResult> {
  return runSpawn(
    "git",
    ["clone", "--depth", "50", "--branch", branch, cloneUrl, targetDir],
    "/tmp",
    "git clone",
  );
}
