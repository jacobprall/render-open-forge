import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerNotificationTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-notifications", {
    title: "List Notifications",
    description: "List recent notifications for the current user.",
    inputSchema: z.object({
      limit: z.number().optional().describe("Max results (default 20)"),
      offset: z.number().optional(),
    }),
  }, async ({ limit, offset }) => {
    const result = await p.notifications.list(auth, {
      limit: limit ?? 20,
      offset: offset ?? 0,
    });
    return textResult(result);
  });
};
