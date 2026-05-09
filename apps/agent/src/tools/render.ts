import { tool } from "ai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import {
  RenderClient,
  TERMINAL_DEPLOY_STATUSES,
  estimateMonthlyCostCents,
  formatCost,
  type RenderService,
  type RenderLogEntry,
  type RenderEnvVar,
  type CreateServiceParams,
  type CreatePostgresParams,
  type CreateRedisParams,
} from "@openforge/render-client";
import { infraActions, infraResources, infraSpecs } from "@openforge/db";
import type { PlatformDb } from "@openforge/platform";
import { isForgeAgentContext } from "../context/agent-context";

function getRenderClient(): RenderClient {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) throw new Error("RENDER_API_KEY not configured");
  return new RenderClient({ apiKey });
}

function getSessionId(experimentalContext: unknown): string {
  if (isForgeAgentContext(experimentalContext)) return experimentalContext.sessionId;
  return "unknown";
}

async function logAction(
  db: PlatformDb | undefined,
  params: {
    projectId: string;
    sessionId: string;
    kind: string;
    input?: unknown;
    output?: unknown;
    status: "success" | "failed";
    error?: string;
    resourceId?: string;
  },
): Promise<void> {
  if (!db) return;
  try {
    await db.insert(infraActions).values({
      id: crypto.randomUUID(),
      projectId: params.projectId,
      sessionId: params.sessionId,
      kind: params.kind,
      input: params.input as Record<string, unknown>,
      output: params.output as Record<string, unknown>,
      status: params.status,
      error: params.error,
      resourceId: params.resourceId,
    });
  } catch (err) {
    console.warn("[render] failed to log action:", err);
  }
}

async function trackResource(
  db: PlatformDb | undefined,
  params: {
    projectId: string;
    kind: "web_service" | "worker" | "postgres" | "redis";
    name: string;
    externalId: string;
    externalUrl?: string;
    actual: unknown;
  },
): Promise<string | undefined> {
  if (!db) return undefined;
  try {
    const id = crypto.randomUUID();
    await db.insert(infraResources).values({
      id,
      projectId: params.projectId,
      kind: params.kind,
      name: params.name,
      externalId: params.externalId,
      externalUrl: params.externalUrl,
      status: "active",
      actual: params.actual as Record<string, unknown>,
    });
    return id;
  } catch (err) {
    console.warn("[render] failed to track resource:", err);
    return undefined;
  }
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
          status: s.suspended,
          url: s.serviceDetails?.url ?? null,
          plan: s.serviceDetails?.plan ?? "unknown",
        })),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_deploy
// ---------------------------------------------------------------------------

export function renderDeployTool(db?: PlatformDb) {
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
    execute: async ({ serviceId, commitId, clearCache }, { experimental_context }) => {
      const sessionId = getSessionId(experimental_context);
      const client = getRenderClient();
      const deploy = await client.createDeploy(serviceId, {
        commitId,
        clearCache,
      });
      const deploys = await client.listDeploys(serviceId);
      const previous = deploys.find((d) => d.id !== deploy.id);

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "deploy.triggered",
        input: { serviceId, commitId, clearCache },
        output: { deployId: deploy.id, status: deploy.status },
        status: "success",
      });

      return {
        deployId: deploy.id,
        status: deploy.status,
        previousDeploy: previous
          ? { status: previous.status, commitId: previous.commit?.id }
          : null,
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

export function renderSetEnvVarsTool(db?: PlatformDb) {
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
    execute: async ({ serviceId, envVars }, { experimental_context }) => {
      const sessionId = getSessionId(experimental_context);
      const client = getRenderClient();
      const updated = await client.updateEnvVars(serviceId, envVars);

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "env_vars.updated",
        input: { serviceId, keys: envVars.map((ev) => ev.key) },
        output: { count: updated.length },
        status: "success",
      });

      return {
        updated: updated.map((ev: RenderEnvVar) => ev.key),
        count: updated.length,
        hint: "Env vars updated. Trigger a redeploy with render_deploy for changes to take effect.",
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_get_service
// ---------------------------------------------------------------------------

export function renderGetServiceTool() {
  return tool({
    description:
      "Get full details for a single Render service by ID. Use render_list_services to discover IDs.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID (e.g. srv-abc123)"),
    }),
    execute: async ({ serviceId }) => {
      const client = getRenderClient();
      return client.getService(serviceId);
    },
  });
}

// ---------------------------------------------------------------------------
// render_create_service
// ---------------------------------------------------------------------------

export function renderCreateServiceTool(db?: PlatformDb) {
  return tool({
    description:
      "Create a new Render service (web, worker, private, or cron). Requires RENDER_OWNER_ID. Returns the created service and an estimated monthly cost.",
    inputSchema: z.object({
      name: z.string().describe("Service name"),
      type: z
        .enum(["web_service", "background_worker", "private_service", "cron_job"])
        .describe("Render service type"),
      runtime: z
        .enum(["node", "python", "docker", "go", "rust", "ruby", "elixir"])
        .describe("Runtime / environment"),
      plan: z.string().optional().default("starter").describe("Instance plan (default starter)"),
      region: z.string().optional().describe("Deploy region slug"),
      buildCommand: z.string().optional(),
      startCommand: z.string().optional(),
      repo: z.string().optional().describe("Repository URL if connecting a repo"),
      branch: z.string().optional(),
      envVars: z
        .array(z.object({ key: z.string(), value: z.string() }))
        .optional()
        .describe("Initial environment variables"),
      autoDeploy: z.enum(["yes", "no"]).optional().describe("Auto-deploy on git push"),
    }),
    execute: async (
      { name, type, runtime, plan, region, buildCommand, startCommand, repo, branch, envVars, autoDeploy },
      { experimental_context },
    ) => {
      const sessionId = getSessionId(experimental_context);
      const ownerId = process.env.RENDER_OWNER_ID;
      if (!ownerId) throw new Error("RENDER_OWNER_ID not configured");

      const client = getRenderClient();
      const params: CreateServiceParams = {
        name,
        ownerId,
        type,
        runtime,
        plan,
        ...(region !== undefined ? { region } : {}),
        ...(buildCommand !== undefined ? { buildCommand } : {}),
        ...(startCommand !== undefined ? { startCommand } : {}),
        ...(repo !== undefined ? { repo } : {}),
        ...(branch !== undefined ? { branch } : {}),
        ...(envVars !== undefined ? { envVars } : {}),
        ...(autoDeploy !== undefined ? { autoDeploy } : {}),
      };
      const service = await client.createService(params);
      const costCents = estimateMonthlyCostCents(type, plan);

      const resourceKind = type === "background_worker" ? "worker" : "web_service" as const;
      const resourceId = await trackResource(db, {
        projectId: sessionId,
        kind: resourceKind,
        name,
        externalId: service.id,
        externalUrl: service.serviceDetails?.url,
        actual: service,
      });

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "resource.created",
        input: { name, type, plan, runtime },
        output: { serviceId: service.id, url: service.serviceDetails?.url },
        status: "success",
        resourceId,
      });

      return {
        service,
        estimatedMonthlyCostCents: costCents,
        estimatedMonthlyCost: formatCost(costCents),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_list_postgres
// ---------------------------------------------------------------------------

export function renderListPostgresTool() {
  return tool({
    description:
      "List PostgreSQL databases in the Render account. Returns id, name, plan, status, and version.",
    inputSchema: z.object({
      limit: z.number().optional().describe("Max databases to return (default 20)"),
    }),
    execute: async ({ limit }) => {
      const client = getRenderClient();
      return { postgres: await client.listPostgres(limit) };
    },
  });
}

// ---------------------------------------------------------------------------
// render_create_postgres
// ---------------------------------------------------------------------------

export function renderCreatePostgresTool(db?: PlatformDb) {
  return tool({
    description:
      "Create a new Render PostgreSQL database. Requires RENDER_OWNER_ID. Returns the database record and estimated monthly cost.",
    inputSchema: z.object({
      name: z.string(),
      plan: z.string().optional().default("starter"),
      region: z.string().optional(),
      version: z.string().optional().default("16"),
    }),
    execute: async ({ name, plan, region, version }, { experimental_context }) => {
      const sessionId = getSessionId(experimental_context);
      const ownerId = process.env.RENDER_OWNER_ID;
      if (!ownerId) throw new Error("RENDER_OWNER_ID not configured");

      const client = getRenderClient();
      const params: CreatePostgresParams = {
        name,
        ownerId,
        plan,
        version,
        ...(region !== undefined ? { region } : {}),
      };
      const pg = await client.createPostgres(params);
      const costCents = estimateMonthlyCostCents("postgres", plan);

      const resourceId = await trackResource(db, {
        projectId: sessionId,
        kind: "postgres",
        name,
        externalId: pg.id,
        actual: pg,
      });

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "resource.created",
        input: { name, plan, version },
        output: { postgresId: pg.id },
        status: "success",
        resourceId,
      });

      return {
        postgres: pg,
        estimatedMonthlyCostCents: costCents,
        estimatedMonthlyCost: formatCost(costCents),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_create_redis
// ---------------------------------------------------------------------------

export function renderCreateRedisTool(db?: PlatformDb) {
  return tool({
    description:
      "Create a new Render Redis instance. Requires RENDER_OWNER_ID. Returns the API response and estimated monthly cost.",
    inputSchema: z.object({
      name: z.string(),
      plan: z.string().optional().default("starter"),
      region: z.string().optional(),
      maxmemoryPolicy: z.string().optional(),
    }),
    execute: async ({ name, plan, region, maxmemoryPolicy }, { experimental_context }) => {
      const sessionId = getSessionId(experimental_context);
      const ownerId = process.env.RENDER_OWNER_ID;
      if (!ownerId) throw new Error("RENDER_OWNER_ID not configured");

      const client = getRenderClient();
      const params: CreateRedisParams = {
        name,
        ownerId,
        plan,
        ...(region !== undefined ? { region } : {}),
        ...(maxmemoryPolicy !== undefined ? { maxmemoryPolicy } : {}),
      };
      const redisInst = await client.createRedis(params);
      const costCents = estimateMonthlyCostCents("redis", plan);

      const resourceId = await trackResource(db, {
        projectId: sessionId,
        kind: "redis",
        name,
        externalId: redisInst.id,
        actual: redisInst,
      });

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "resource.created",
        input: { name, plan },
        output: { redisId: redisInst.id },
        status: "success",
        resourceId,
      });

      return {
        redis: redisInst,
        estimatedMonthlyCostCents: costCents,
        estimatedMonthlyCost: formatCost(costCents),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_create_preview
// ---------------------------------------------------------------------------

export function renderCreatePreviewTool(db?: PlatformDb) {
  return tool({
    description:
      "Create a preview environment on Render for a pull request branch. " +
      "This deploys a temporary web service from the given branch so the user can " +
      "review changes live before merging. The preview service name is prefixed with " +
      "'preview-' and auto-deploys from the branch. Returns the service URL and ID. " +
      "Remember to clean up previews with render_delete_preview after the PR is merged.",
    inputSchema: z.object({
      repo: z.string().describe("GitHub repository URL (e.g. https://github.com/owner/repo)"),
      branch: z.string().describe("Branch name to deploy (typically the PR branch)"),
      name: z.string().optional().describe("Override preview service name (defaults to preview-<branch>)"),
      runtime: z
        .enum(["node", "python", "docker", "go", "rust", "ruby", "elixir"])
        .optional()
        .default("node")
        .describe("Runtime (default node)"),
      buildCommand: z.string().optional().describe("Build command"),
      startCommand: z.string().optional().describe("Start command"),
      plan: z.string().optional().default("starter").describe("Instance plan (default starter)"),
      envVars: z
        .array(z.object({ key: z.string(), value: z.string() }))
        .optional()
        .describe("Environment variables for the preview"),
    }),
    execute: async (
      { repo, branch, name, runtime, buildCommand, startCommand, plan, envVars },
      { experimental_context },
    ) => {
      const sessionId = getSessionId(experimental_context);
      const ownerId = process.env.RENDER_OWNER_ID;
      if (!ownerId) throw new Error("RENDER_OWNER_ID not configured");

      const client = getRenderClient();
      const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
      const serviceName = name || `preview-${safeBranch}`;

      const params: CreateServiceParams = {
        name: serviceName,
        ownerId,
        type: "web_service",
        runtime: runtime ?? "node",
        plan,
        repo,
        branch,
        autoDeploy: "yes",
        ...(buildCommand ? { buildCommand } : {}),
        ...(startCommand ? { startCommand } : {}),
        ...(envVars ? { envVars } : {}),
      };

      const service = await client.createService(params);
      const costCents = estimateMonthlyCostCents("web_service", plan);

      const resourceId = await trackResource(db, {
        projectId: sessionId,
        kind: "web_service",
        name: serviceName,
        externalId: service.id,
        externalUrl: service.serviceDetails?.url,
        actual: { ...service, isPreview: true, sourceBranch: branch },
      });

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "preview.created",
        input: { repo, branch, serviceName, plan },
        output: { serviceId: service.id, url: service.serviceDetails?.url },
        status: "success",
        resourceId,
      });

      return {
        serviceId: service.id,
        name: serviceName,
        url: service.serviceDetails?.url ?? null,
        branch,
        status: "deploying",
        estimatedMonthlyCost: formatCost(costCents),
        hint: `Preview environment created. It will auto-deploy from branch "${branch}". ` +
          `Use render_get_deploy_status to monitor. Clean up with render_delete_preview after merging.`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_delete_preview
// ---------------------------------------------------------------------------

export function renderDeletePreviewTool(db?: PlatformDb) {
  return tool({
    description:
      "Delete a preview environment after its PR has been merged or closed. " +
      "Pass the service ID from render_create_preview. This stops and removes the service.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Render service ID of the preview to delete"),
    }),
    execute: async ({ serviceId }, { experimental_context }) => {
      const sessionId = getSessionId(experimental_context);
      const client = getRenderClient();

      let serviceName = serviceId;
      try {
        const service = await client.getService(serviceId);
        serviceName = service.name;
      } catch {
        // Service may already be deleted -- proceed with delete attempt
      }

      try {
        await client.deleteService(serviceId);
      } catch (err) {
        const isNotFound = err instanceof Error && err.message.includes("404");
        if (!isNotFound) throw err;
      }

      await logAction(db, {
        projectId: sessionId,
        sessionId,
        kind: "preview.deleted",
        input: { serviceId },
        output: { name: serviceName },
        status: "success",
      });

      return {
        deleted: true,
        serviceId,
        name: serviceName,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// render_get_postgres_connection
// ---------------------------------------------------------------------------

export function renderGetPostgresConnectionTool() {
  return tool({
    description:
      "Get connection strings and credentials for a Render PostgreSQL database. Use after render_list_postgres or render_create_postgres.",
    inputSchema: z.object({
      postgresId: z.string().describe("The Render PostgreSQL instance ID"),
    }),
    execute: async ({ postgresId }) => {
      const client = getRenderClient();
      return client.getPostgresConnectionInfo(postgresId);
    },
  });
}

// ---------------------------------------------------------------------------
// render_project_status
// ---------------------------------------------------------------------------

export function renderProjectStatusTool(db?: PlatformDb) {
  return tool({
    description:
      "Get a full overview of the project's tracked infrastructure: specs, resources, health, and recent actions. Uses the session as the project scope.",
    inputSchema: z.object({
      projectId: z
        .string()
        .describe("The project ID (usually the session ID). Pass your current session ID."),
    }),
    execute: async ({ projectId }) => {
      if (!db) {
        return { error: "Database not available for project status queries" };
      }
      const specRows = await db
        .select()
        .from(infraSpecs)
        .where(eq(infraSpecs.projectId, projectId));
      const resourceRows = await db
        .select()
        .from(infraResources)
        .where(eq(infraResources.projectId, projectId));
      const recentActions = await db
        .select()
        .from(infraActions)
        .where(eq(infraActions.projectId, projectId))
        .orderBy(desc(infraActions.createdAt))
        .limit(10);
      return {
        specs: specRows,
        resources: resourceRows,
        recentActions,
        summary: `${specRows.length} specs, ${resourceRows.length} resources, ${recentActions.length} recent actions`,
      };
    },
  });
}
