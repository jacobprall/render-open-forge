import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerInboxTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-inbox", {
    title: "List Inbox",
    description: "List inbox items (PR events requiring attention).",
    inputSchema: z.object({
      filter: z.enum(["all", "unread", "action_needed"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }),
  }, async (params) => {
    const result = await p.inbox.list(auth, params);
    return textResult(result);
  });

  server.registerTool("inbox-count", {
    title: "Inbox Count",
    description: "Get unread inbox count.",
  }, async () => {
    const count = await p.inbox.countUnread(auth);
    return textResult({ unread: count });
  });

  server.registerTool("dismiss-inbox", {
    title: "Dismiss Inbox Items",
    description: "Dismiss inbox items so they no longer surface.",
    inputSchema: z.object({
      eventIds: z.array(z.string()),
    }),
  }, async ({ eventIds }) => {
    await p.inbox.dismiss(auth, eventIds);
    return textResult({ ok: true });
  });
};
