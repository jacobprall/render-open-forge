// ---------------------------------------------------------------------------
// Render API response types (subset needed for v0)
// ---------------------------------------------------------------------------

export interface RenderService {
  id: string;
  name: string;
  type: "web_service" | "private_service" | "background_worker" | "static_site" | "cron_job";
  slug: string;
  suspended: "suspended" | "not_suspended";
  serviceDetails: {
    url?: string;
    buildCommand?: string;
    startCommand?: string;
    region?: string;
    plan?: string;
    runtime?: string;
    env?: string;
  };
  branch?: string;
  dashboardUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RenderDeploy {
  id: string;
  status:
    | "created"
    | "build_in_progress"
    | "update_in_progress"
    | "live"
    | "deactivated"
    | "build_failed"
    | "update_failed"
    | "canceled"
    | "pre_deploy_in_progress"
    | "pre_deploy_failed";
  commit?: {
    id: string;
    message: string;
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface RenderEnvVar {
  key: string;
  value: string;
}

export interface RenderLogEntry {
  id: string;
  timestamp: string;
  message: string;
  level?: string;
}

export type DeployStatus = RenderDeploy["status"];

export const TERMINAL_DEPLOY_STATUSES: Set<DeployStatus> = new Set([
  "live",
  "deactivated",
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_failed",
]);

export interface CreateServiceParams {
  name: string;
  ownerId: string;
  type: "web_service" | "background_worker" | "private_service" | "cron_job";
  runtime: "node" | "python" | "docker" | "go" | "rust" | "ruby" | "elixir";
  plan?: string;
  region?: string;
  buildCommand?: string;
  startCommand?: string;
  branch?: string;
  envVars?: Array<{ key: string; value: string }>;
  repo?: string;
  autoDeploy?: "yes" | "no";
}

export interface CreatePostgresParams {
  name: string;
  ownerId: string;
  plan?: string;
  region?: string;
  version?: string;
}

export interface CreateRedisParams {
  name: string;
  ownerId: string;
  plan?: string;
  region?: string;
  maxmemoryPolicy?: string;
}

export interface RenderPostgres {
  id: string;
  name: string;
  plan: string;
  status: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostgresConnectionInfo {
  internalConnectionString: string;
  externalConnectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
