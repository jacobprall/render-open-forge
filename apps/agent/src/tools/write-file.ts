import { tool } from "ai";
import { z } from "zod";
import { getSandboxContext } from "../context/agent-context";
import { notifyFileChanged } from "./file-events";

const writeFileInputSchema = z.object({
  path: z.string().describe("The file path relative to the workspace root"),
  content: z.string().describe("The content to write"),
});

export function writeFileTool() {
  return tool({
    description: "Write content to a file in the session workspace.",
    inputSchema: writeFileInputSchema,
    execute: async ({ path, content }, { experimental_context }) => {
      const { adapter, sessionId } = getSandboxContext(experimental_context);
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
