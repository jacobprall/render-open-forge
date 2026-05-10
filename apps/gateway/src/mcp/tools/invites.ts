import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerInviteTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-invites", {
    title: "List Invites",
    description: "List pending invitations.",
  }, async () => {
    const result = await p.invites.listInvites(auth);
    return textResult(result);
  });

  server.registerTool("create-invite", {
    title: "Create Invite",
    description: "Invite a new user to the platform.",
    inputSchema: z.object({
      username: z.string().min(1),
      email: z.string().email().optional(),
    }),
  }, async (args) => {
    const result = await p.invites.createInvite(auth, args);
    return textResult(result);
  });
};
