import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerModelTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-models", {
    title: "List Models",
    description: "List available LLM models.",
  }, async () => {
    const result = await p.models.listModels(auth);
    return textResult(result);
  });
};
