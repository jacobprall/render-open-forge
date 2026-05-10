import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerSettingsTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-api-keys", {
    title: "List API Keys",
    description: "List configured LLM provider API keys.",
  }, async () => {
    const result = await p.settings.listApiKeys(auth);
    return textResult(result);
  });

  server.registerTool("create-api-key", {
    title: "Create API Key",
    description: "Create or update an LLM provider API key.",
    inputSchema: z.object({
      provider: z.enum(["anthropic", "openai"]),
      scope: z.enum(["platform", "user"]).default("user"),
      apiKey: z.string().min(1),
      label: z.string().optional(),
    }),
  }, async (args) => {
    const result = await p.settings.createOrUpdateApiKey(auth, args);
    return textResult(result);
  });

  server.registerTool("update-api-key", {
    title: "Update API Key",
    description: "Update an existing API key's label or value.",
    inputSchema: z.object({
      keyId: z.string(),
      label: z.string().optional(),
      apiKey: z.string().optional(),
    }),
  }, async ({ keyId, ...data }) => {
    await p.settings.updateApiKey(auth, keyId, data);
    return textResult({ ok: true });
  });

  server.registerTool("delete-api-key", {
    title: "Delete API Key",
    description: "Delete an LLM provider API key.",
    inputSchema: z.object({ keyId: z.string() }),
  }, async ({ keyId }) => {
    await p.settings.deleteApiKey(auth, keyId);
    return textResult({ ok: true });
  });
};
