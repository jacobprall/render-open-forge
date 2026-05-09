import type { ToolSet } from "ai";
import type Redis from "ioredis";
import { nanoid } from "nanoid";
import { askUserReplyQueueKey } from "@openforge/platform";
import { abortableBlpop } from "./lib/abortable-blpop";

type TrustTier = "read" | "deploy" | "create" | "destructive";

const TOOL_TIERS: Record<string, TrustTier> = {
  render_list_services: "read",
  render_get_service: "read",
  render_get_deploy_status: "read",
  render_get_logs: "read",
  render_list_env_vars: "read",
  render_list_postgres: "read",
  render_get_postgres_connection: "read",
  render_project_status: "read",

  render_deploy: "deploy",

  render_create_service: "create",
  render_create_postgres: "create",
  render_create_redis: "create",
  render_set_env_vars: "create",
  render_create_preview: "create",

  render_delete_preview: "destructive",
};

function buildConfirmationMessage(toolName: string, tier: TrustTier, args: Record<string, unknown>): string {
  const tierLabel = tier === "destructive" ? "DESTRUCTIVE" : "creates infrastructure";
  const parts = [`[${tierLabel}] This action requires your confirmation.`];

  if (toolName === "render_create_service") {
    parts.push(`Create service "${args.name}" (${args.type ?? "web_service"}, ${args.plan ?? "starter"} plan).`);
  } else if (toolName === "render_create_postgres") {
    parts.push(`Create PostgreSQL database "${args.name}" (${args.plan ?? "starter"} plan).`);
  } else if (toolName === "render_create_redis") {
    parts.push(`Create Redis instance "${args.name}" (${args.plan ?? "starter"} plan).`);
  } else if (toolName === "render_create_preview") {
    parts.push(`Create preview environment for branch "${args.branch}" (${args.plan ?? "starter"} plan).`);
  } else if (toolName === "render_set_env_vars") {
    const keys = Array.isArray(args.envVars)
      ? (args.envVars as Array<{ key: string }>).map((e) => e.key).join(", ")
      : "unknown";
    parts.push(`Update environment variables on service ${args.serviceId}: ${keys}.`);
  } else if (toolName === "render_delete_preview") {
    parts.push(`Delete preview service ${args.serviceId}. This cannot be undone.`);
  }

  return parts.join(" ") + " Proceed?";
}

/**
 * Apply trust tier confirmation gates to Render tools that create or destroy infrastructure.
 * Read and deploy tier tools pass through unchanged.
 * Create and destructive tier tools prompt the user for confirmation before executing.
 */
export function applyTrustTiers(
  tools: ToolSet,
  runId: string,
  duplicateRedis: () => Redis,
  publishFn: (event: Record<string, unknown>) => Promise<void>,
): ToolSet {
  const timeoutSec = 900;
  const result: ToolSet = {};

  for (const [name, originalTool] of Object.entries(tools)) {
    const tier = TOOL_TIERS[name];
    if (!tier || tier === "read" || tier === "deploy") {
      result[name] = originalTool;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orig = originalTool as any;
    const wrappedExecute = async (args: never, execOptions: never) => {
        const opts = execOptions as { toolCallId?: string; abortSignal?: AbortSignal };
        const toolCallId = opts.toolCallId ?? nanoid();
        const question = buildConfirmationMessage(name, tier, args as Record<string, unknown>);

        await publishFn({
          type: "ask_user",
          question,
          options: ["Yes, proceed", "No, cancel"],
          toolCallId,
        });

        const key = askUserReplyQueueKey(runId, toolCallId);
        const blocker = duplicateRedis();

        try {
          const popped = await abortableBlpop(blocker, key, timeoutSec, opts.abortSignal);
          if (!popped?.[1]) {
            return { confirmed: false, reason: "No response received. Action cancelled." };
          }

          let message: string;
          try {
            const parsed = JSON.parse(popped[1]) as { message?: string };
            message = typeof parsed.message === "string" ? parsed.message : popped[1];
          } catch {
            message = popped[1];
          }

          const declined = /\b(no|cancel|decline|stop|don'?t)\b/i.test(message);
          if (declined) {
            return { confirmed: false, reason: `User declined: "${message}"` };
          }

          if (!orig.execute) return { error: "Tool has no execute function" };
          return orig.execute(args, execOptions);
        } finally {
          void blocker.quit().catch(() => {});
        }
      };

    result[name] = { ...orig, execute: wrappedExecute };
  }

  return result;
}
