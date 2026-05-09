import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Infrastructure: Specs (what the agent intended to create)
// ---------------------------------------------------------------------------

export const infraSpecs = pgTable(
  "infra_specs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull(),
    kind: text("kind", {
      enum: ["web_service", "worker", "postgres", "redis"],
    }).notNull(),
    name: text("name").notNull(),
    desired: jsonb("desired").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("infra_specs_project_kind_name_idx").on(
      table.projectId,
      table.kind,
      table.name,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Infrastructure: Resources (what actually exists on Render)
// ---------------------------------------------------------------------------

export const infraResources = pgTable(
  "infra_resources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull(),
    specId: text("spec_id").references(() => infraSpecs.id),
    kind: text("kind", {
      enum: ["web_service", "worker", "postgres", "redis"],
    }).notNull(),
    name: text("name").notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    status: text("status", {
      enum: ["active", "suspended", "deleted"],
    }).notNull(),
    actual: jsonb("actual").notNull(),
    healthStatus: text("health_status", {
      enum: ["healthy", "unhealthy", "unknown"],
    })
      .notNull()
      .default("unknown"),
    lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infra_resources_project_id_idx").on(table.projectId),
    index("infra_resources_external_id_idx").on(table.externalId),
  ],
);

// ---------------------------------------------------------------------------
// Infrastructure: Actions (append-only log of what happened)
// ---------------------------------------------------------------------------

export const infraActions = pgTable(
  "infra_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id"),
    kind: text("kind").notNull(),
    specId: text("spec_id"),
    resourceId: text("resource_id"),
    input: jsonb("input"),
    output: jsonb("output"),
    status: text("status", {
      enum: ["success", "failed"],
    }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infra_actions_project_id_idx").on(table.projectId),
    index("infra_actions_session_id_idx").on(table.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// Infrastructure: Observations (external events)
// ---------------------------------------------------------------------------

export const infraObservations = pgTable(
  "infra_observations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id"),
    kind: text("kind").notNull(),
    severity: text("severity", {
      enum: ["info", "warning", "critical"],
    })
      .notNull()
      .default("info"),
    summary: text("summary").notNull(),
    detail: jsonb("detail"),
    source: text("source").notNull(),
    acknowledged: boolean("acknowledged").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infra_observations_project_id_idx").on(table.projectId),
    index("infra_observations_unacked_idx").on(
      table.projectId,
      table.acknowledged,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InfraSpec = typeof infraSpecs.$inferSelect;
export type NewInfraSpec = typeof infraSpecs.$inferInsert;
export type InfraResource = typeof infraResources.$inferSelect;
export type NewInfraResource = typeof infraResources.$inferInsert;
export type InfraAction = typeof infraActions.$inferSelect;
export type NewInfraAction = typeof infraActions.$inferInsert;
export type InfraObservation = typeof infraObservations.$inferSelect;
export type NewInfraObservation = typeof infraObservations.$inferInsert;
