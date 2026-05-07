import { tool } from "ai";
import { z } from "zod";
import { getAdapter, getSessionId } from "../context/agent-context";

const globInputSchema = z.object({
  pattern: z.string().describe("The glob pattern (e.g. '**/*.ts')"),
});

export function globTool() {
  return tool({
    description: "Find files matching a glob pattern in the session workspace.",
    inputSchema: globInputSchema,
    execute: async ({ pattern }, { experimental_context }) => {
      const adapter = getAdapter(experimental_context);
      const sessionId = getSessionId(experimental_context);
      const files = await adapter.glob(sessionId, pattern);
      return { files };
    },
  });
}
