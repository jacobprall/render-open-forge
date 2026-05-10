import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerOrgTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-orgs", {
    title: "List Organizations",
    description: "List organizations the current user belongs to.",
  }, async () => {
    const orgs = await p.orgs.listOrgs(auth);
    return textResult(orgs);
  });

  server.registerTool("create-org", {
    title: "Create Organization",
    description: "Create a new organization.",
    inputSchema: z.object({
      login: z.string(),
      fullName: z.string().optional(),
      description: z.string().optional(),
    }),
  }, async (args) => {
    const org = await p.orgs.createOrg(auth, args);
    return textResult(org);
  });

  server.registerTool("delete-org", {
    title: "Delete Organization",
    description: "Delete an organization.",
    inputSchema: z.object({ orgName: z.string() }),
  }, async ({ orgName }) => {
    await p.orgs.deleteOrg(auth, orgName);
    return textResult({ ok: true });
  });

  server.registerTool("list-org-members", {
    title: "List Org Members",
    description: "List members of an organization.",
    inputSchema: z.object({ orgName: z.string() }),
  }, async ({ orgName }) => {
    const members = await p.orgs.listMembers(auth, orgName);
    return textResult(members);
  });

  server.registerTool("add-org-member", {
    title: "Add Org Member",
    description: "Add a user to an organization.",
    inputSchema: z.object({
      orgName: z.string(),
      username: z.string(),
    }),
  }, async ({ orgName, username }) => {
    await p.orgs.addMember(auth, orgName, username);
    return textResult({ ok: true });
  });

  server.registerTool("remove-org-member", {
    title: "Remove Org Member",
    description: "Remove a user from an organization.",
    inputSchema: z.object({
      orgName: z.string(),
      username: z.string(),
    }),
  }, async ({ orgName, username }) => {
    await p.orgs.removeMember(auth, orgName, username);
    return textResult({ ok: true });
  });

  server.registerTool("list-org-secrets", {
    title: "List Org Secrets",
    description: "List secrets configured on an organization.",
    inputSchema: z.object({ orgName: z.string() }),
  }, async ({ orgName }) => {
    const secrets = await p.orgs.listSecrets(auth, orgName);
    return textResult(secrets);
  });

  server.registerTool("set-org-secret", {
    title: "Set Org Secret",
    description: "Create or update an organization secret.",
    inputSchema: z.object({
      orgName: z.string(),
      name: z.string(),
      value: z.string(),
    }),
  }, async ({ orgName, name, value }) => {
    await p.orgs.setSecret(auth, orgName, name, value);
    return textResult({ ok: true });
  });

  server.registerTool("delete-org-secret", {
    title: "Delete Org Secret",
    description: "Remove a secret from an organization.",
    inputSchema: z.object({
      orgName: z.string(),
      name: z.string(),
    }),
  }, async ({ orgName, name }) => {
    await p.orgs.deleteSecret(auth, orgName, name);
    return textResult({ ok: true });
  });

  server.registerTool("get-usage", {
    title: "Get Usage",
    description: "Get usage metrics for the current user.",
  }, async () => {
    const usage = await p.orgs.getUsage(auth);
    return textResult(usage);
  });

  // -- Platform org (singleton) ------------------------------------------------

  server.registerTool("get-platform-org", {
    title: "Get Platform Org",
    description: "Get the platform-level organization details.",
  }, async () => {
    const org = await p.orgs.getPlatformOrg();
    return textResult(org ?? { error: "Organization not configured" });
  });

  server.registerTool("update-platform-org", {
    title: "Update Platform Org",
    description: "Update the platform-level organization.",
    inputSchema: z.object({
      name: z.string().optional(),
      slug: z.string().optional(),
    }),
  }, async (data) => {
    const org = await p.orgs.updatePlatformOrg(auth, data);
    return textResult(org);
  });

  server.registerTool("list-platform-members", {
    title: "List Platform Members",
    description: "List all members of the platform organization.",
  }, async () => {
    const members = await p.orgs.listPlatformMembers();
    return textResult(members);
  });
};
