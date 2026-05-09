import { tool } from "ai";
import { z } from "zod";
import {
  RenderClient,
  TERMINAL_DEPLOY_STATUSES,
  type RenderService,
  type RenderLogEntry,
  type RenderEnvVar,
} from "@openforge/render-client";

function getRenderClient(): RenderClient {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) throw new Error("RENDER_API_KEY not configured");
  return new RenderClient({ apiKey });
}

// ---------------------------------------------------------------------------
// render_list_services
// ---------------------------------------------------------------------------

export function renderListServicesTool() {
  return tool({
    description:
      "List all services in the user's Render account. Returns service names, IDs, types, status, and URLs. Use this to discover what's deployed and get service IDs for other Render tools.",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Max services to return (default 20)"),
    }),
    execute: async ({ limit }) => {
      const client = getRenderClient();
      const services = await client.listServices(limit);
      return {
        services: services.map((s: RenderService) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          url: s.serviceDetails.url,
          suspended: s.suspended,
          region: s.serviceDetails.region,
          plan: s.serviceDetails.plan,
          branch: s.branch,
        })),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_deploy
// ---------------------------------------------------------------------------

export function renderDeployTool() {
  return tool({
    description:
      "Trigger a deploy for a Render service. Returns the deploy ID which you can poll with render_get_deploy_status. Optionally specify a commit SHA or clear the build cache.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID (e.g. srv-abc123)"),
      commitId: z
        .string()
        .optional()
        .describe("Specific git commit SHA to deploy. Defaults to latest."),
      clearCache: z
        .boolean()
        .optional()
        .describe("Clear build cache before deploying (default false)"),
    }),
    execute: async ({ serviceId, commitId, clearCache }) => {
      const client = getRenderClient();
      const deploy = await client.createDeploy(serviceId, {
        commitId,
        clearCache,
      });
      return {
        deployId: deploy.id,
        status: deploy.status,
        message: `Deploy triggered. Use render_get_deploy_status with serviceId="${serviceId}" and deployId="${deploy.id}" to poll until complete.`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_get_deploy_status
// ---------------------------------------------------------------------------

export function renderGetDeployStatusTool() {
  return tool({
    description:
      "Check the status of a Render deploy. Poll this after render_deploy until status is terminal (live, build_failed, update_failed, canceled). If the deploy failed, use render_get_logs to diagnose.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID"),
      deployId: z.string().describe("The deploy ID from render_deploy"),
    }),
    execute: async ({ serviceId, deployId }) => {
      const client = getRenderClient();
      const deploy = await client.getDeploy(serviceId, deployId);
      const isTerminal = TERMINAL_DEPLOY_STATUSES.has(deploy.status);
      return {
        deployId: deploy.id,
        status: deploy.status,
        isTerminal,
        commit: deploy.commit
          ? { sha: deploy.commit.id, message: deploy.commit.message }
          : null,
        createdAt: deploy.createdAt,
        finishedAt: deploy.finishedAt ?? null,
        ...(isTerminal && deploy.status !== "live"
          ? {
              hint: `Deploy failed with status "${deploy.status}". Use render_get_logs to read the build/runtime logs and diagnose the issue.`,
            }
          : {}),
        ...(isTerminal && deploy.status === "live"
          ? { hint: "Deploy is live and healthy." }
          : {}),
        ...(!isTerminal
          ? {
              hint: `Deploy is still in progress (${deploy.status}). Poll again in a few seconds.`,
            }
          : {}),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_get_logs
// ---------------------------------------------------------------------------

export function renderGetLogsTool() {
  return tool({
    description:
      "Read recent logs for a Render service. Use this to diagnose deploy failures, runtime errors, or verify the service is working. Returns the most recent log entries.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID"),
      limit: z
        .number()
        .optional()
        .describe("Number of log lines to return (default 100)"),
    }),
    execute: async ({ serviceId, limit }) => {
      const client = getRenderClient();
      const logs = await client.getLogs(serviceId, {
        direction: "backward",
        limit: limit ?? 100,
      });
      return {
        entries: logs.map((l: RenderLogEntry) => ({
          timestamp: l.timestamp,
          message: l.message,
          level: l.level,
        })),
        count: logs.length,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_list_env_vars
// ---------------------------------------------------------------------------

export function renderListEnvVarsTool() {
  return tool({
    description:
      "List all environment variables currently set on a Render service. Use this BEFORE render_set_env_vars to avoid accidentally wiping existing variables. Returns key-value pairs.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID"),
    }),
    execute: async ({ serviceId }) => {
      const client = getRenderClient();
      const envVars = await client.listEnvVars(serviceId);
      return {
        envVars: envVars.map((ev: RenderEnvVar) => ({
          key: ev.key,
          value: ev.value,
        })),
        count: envVars.length,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_set_env_vars
// ---------------------------------------------------------------------------

export function renderSetEnvVarsTool() {
  return tool({
    description:
      "Set environment variables on a Render service. WARNING: This replaces ALL env vars on the service. Always call render_list_env_vars first, merge your changes with existing vars, and pass the full set. After setting env vars, trigger a redeploy with render_deploy for changes to take effect.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID"),
      envVars: z
        .array(
          z.object({
            key: z.string().describe("Environment variable name"),
            value: z.string().describe("Environment variable value"),
          }),
        )
        .describe("Full set of { key, value } pairs — includes existing vars you want to keep"),
    }),
    execute: async ({ serviceId, envVars }) => {
      const client = getRenderClient();
      const updated = await client.updateEnvVars(serviceId, envVars);
      return {
        updated: updated.map((ev: RenderEnvVar) => ev.key),
        count: updated.length,
        hint: "Env vars updated. Trigger a redeploy with render_deploy for changes to take effect.",
      };
    },
  });
}
