import { tool } from "ai";
import { z } from "zod";
import { getAdapter, getSessionId } from "../context/agent-context";
import { notifyFileChanged } from "./truncation";

const writeFileInputSchema = z.object({
  path: z.string().describe("The file path relative to the workspace root"),
  content: z.string().describe("The content to write"),
});

export function writeFileTool() {
  return tool({
    description: "Write content to a file in the session workspace.",
    inputSchema: writeFileInputSchema,
    execute: async ({ path, content }, { experimental_context }) => {
      const adapter = getAdapter(experimental_context);
      const sessionId = getSessionId(experimental_context);
      let before = "";
      try {
        const file = await adapter.readFile(sessionId, path);
        if (file.exists) before = file.content;
      } catch {}
      await adapter.writeFile(sessionId, path, content);
      await notifyFileChanged(experimental_context, path, before, content);
      return { ok: true };
    },
  });
}
