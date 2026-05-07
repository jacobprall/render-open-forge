import { tool } from "ai";
import { z } from "zod";
import { getAdapter, getSessionId } from "../context/agent-context";
import { truncateLargeString, MAX_BASH_STREAM_CHARS } from "./truncation";

const bashInputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
  timeoutMs: z.number().optional().describe("Timeout in milliseconds (default 120000)"),
});

function bashInvokesRemoteGit(command: string): boolean {
  return /\bgit(\s+[\S]+)*\s+(push|fetch|pull)\b/.test(command);
}

export function bashTool() {
  return tool({
    description:
      "Execute a bash command in the session workspace. Do not use this for `git push`, `git fetch`, or `git pull` — use the git tool for those so forge authentication is applied.",
    inputSchema: bashInputSchema,
    execute: async ({ command, timeoutMs }, { experimental_context }) => {
      if (bashInvokesRemoteGit(command)) {
        return {
          stdout: "",
          stderr:
            "git push, git fetch, and git pull must be run via the git tool (e.g. args: [\"push\", \"origin\", \"my-branch\"]), not bash. The git tool injects forge credentials automatically.",
          exitCode: 1,
          timedOut: false,
        };
      }
      const adapter = getAdapter(experimental_context);
      const sessionId = getSessionId(experimental_context);
      const result = await adapter.exec(sessionId, command, timeoutMs);
      const stdout = truncateLargeString(result.stdout, MAX_BASH_STREAM_CHARS);
      const stderr = truncateLargeString(result.stderr, MAX_BASH_STREAM_CHARS);
      return {
        stdout: stdout.value,
        stderr: stderr.value,
        exitCode: result.exitCode,
        ...(stdout.truncated || stderr.truncated
          ? {
              truncated: {
                stdout: stdout.truncated ? stdout.originalLength : undefined,
                stderr: stderr.truncated ? stderr.originalLength : undefined,
                hint: "Output was truncated. Re-run with grep/sed/head/tail to inspect specific ranges.",
              },
            }
          : {}),
      };
    },
  });
}
