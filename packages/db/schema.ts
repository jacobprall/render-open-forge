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
// Sessions (agent workspaces tied to Forgejo repos)
// ---------------------------------------------------------------------------

export type SessionPhase =
  | "understand"
  | "spec"
  | "execute"
  | "verify"
  | "deliver"
  | "complete"
  | "failed";

export type WorkflowMode = "full" | "standard" | "fast" | "yolo";

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed", "archived"],
    })
      .notNull()
      .default("running"),

    // Forgejo repo binding
    forgejoRepoPath: text("forgejo_repo_path").notNull(),
    branch: text("branch").notNull(),
    baseBranch: text("base_branch").notNull().default("main"),

    // PR state
    prNumber: integer("pr_number"),
    prStatus: text("pr_status", {
      enum: ["open", "merged", "closed"],
    }),

    // Upstream sync (optional — only if linked to external repo)
    upstreamProvider: text("upstream_provider"),
    upstreamRepoUrl: text("upstream_repo_url"),
    upstreamPrUrl: text("upstream_pr_url"),

    // Workflow
    phase: text("phase", {
      enum: ["understand", "spec", "execute", "verify", "deliver", "complete", "failed"],
    }).notNull().default("execute"),
    workflowMode: text("workflow_mode", {
      enum: ["full", "standard", "fast", "yolo"],
    }).notNull().default("standard"),

    // Project context
    projectConfig: jsonb("project_config"),
    projectContext: text("project_context"),

    // Git stats
    linesAdded: integer("lines_added").default(0),
    linesRemoved: integer("lines_removed").default(0),

    // CI fix tracking
    ciFixAttempts: integer("ci_fix_attempts").notNull().default(0),
    maxCiFixAttempts: integer("max_ci_fix_attempts").notNull().default(3),

    // Timestamps
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// ---------------------------------------------------------------------------
// Chats & messages
// ---------------------------------------------------------------------------

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    modelId: text("model_id").default("anthropic/claude-sonnet-4-5"),
    activeRunId: text("active_run_id"),
    lastAssistantMessageAt: timestamp("last_assistant_message_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("chats_session_id_idx").on(table.sessionId)],
);

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["user", "assistant"],
  }).notNull(),
  parts: jsonb("parts").notNull(),
  modelMessages: jsonb("model_messages"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Agent runs
// ---------------------------------------------------------------------------

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    modelId: text("model_id"),
    phase: text("phase", {
      enum: ["understand", "spec", "execute", "verify", "deliver", "complete", "failed"],
    }),
    status: text("status", {
      enum: ["queued", "running", "completed", "aborted", "failed", "error"],
    }).notNull().default("queued"),
    trigger: text("trigger", {
      enum: ["user_message", "ci_failure", "review_comment", "pr_opened", "pr_merged", "workflow_run"],
    }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    totalDurationMs: integer("total_duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_runs_chat_id_idx").on(table.chatId),
    index("agent_runs_session_id_idx").on(table.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// CI events (from Forgejo Actions webhooks)
// ---------------------------------------------------------------------------

export const ciEvents = pgTable("ci_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["ci_failure", "ci_success", "review_comment", "pr_merged", "pr_closed"],
  }).notNull(),
  workflowName: text("workflow_name"),
  runId: text("run_id"),
  status: text("status", {
    enum: ["pending", "running", "success", "failure", "error"],
  }),
  logsUrl: text("logs_url"),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Sync connections (external forge accounts)
// ---------------------------------------------------------------------------

export const syncConnections = pgTable(
  "sync_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider", {
      enum: ["github", "gitlab", "bitbucket"],
    }).notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at"),
    remoteUsername: text("remote_username"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sync_connections_user_provider_idx").on(table.userId, table.provider),
  ],
);

// ---------------------------------------------------------------------------
// Mirrors (active repo sync relationships)
// ---------------------------------------------------------------------------

export const mirrors = pgTable("mirrors", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  syncConnectionId: text("sync_connection_id")
    .notNull()
    .references(() => syncConnections.id, { onDelete: "cascade" }),
  forgejoRepoPath: text("forgejo_repo_path").notNull(),
  remoteRepoUrl: text("remote_repo_url").notNull(),
  direction: text("direction", {
    enum: ["pull", "push", "bidirectional"],
  }).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  status: text("status", {
    enum: ["active", "paused", "error"],
  }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

export const specs = pgTable("specs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  status: text("status", {
    enum: ["draft", "approved", "rejected", "superseded"],
  }).notNull().default("draft"),
  goal: text("goal").notNull(),
  approach: text("approach").notNull(),
  filesToModify: jsonb("files_to_modify").$type<string[]>().notNull().default([]),
  filesToCreate: jsonb("files_to_create").$type<string[]>().notNull().default([]),
  risks: jsonb("risks").$type<string[]>().notNull().default([]),
  outOfScope: jsonb("out_of_scope").$type<string[]>().notNull().default([]),
  verificationPlan: text("verification_plan").notNull().default(""),
  estimatedComplexity: text("estimated_complexity", {
    enum: ["trivial", "small", "medium", "large"],
  }).notNull().default("small"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

// ---------------------------------------------------------------------------
// Verification results
// ---------------------------------------------------------------------------

export const verificationResults = pgTable("verification_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  checkName: text("check_name").notNull(),
  passed: boolean("passed").notNull().default(false),
  status: text("status", {
    enum: ["pass", "fail", "error", "timeout"],
  }).notNull(),
  exitCode: integer("exit_code"),
  output: text("output").notNull().default(""),
  stdout: text("stdout").notNull().default(""),
  stderr: text("stderr").notNull().default(""),
  durationMs: integer("duration_ms").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  defaultModelId: text("default_model_id").default("anthropic/claude-sonnet-4-5"),
  defaultSubagentModelId: text("default_subagent_model_id"),
  defaultDiffMode: text("default_diff_mode", {
    enum: ["unified", "split"],
  }).default("unified"),
  defaultWorkflowMode: text("default_workflow_mode", {
    enum: ["full", "standard", "fast", "yolo"],
  }).default("standard"),
  autoCommitPush: boolean("auto_commit_push").notNull().default(false),
  autoCreatePr: boolean("auto_create_pr").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

export const usageEvents = pgTable("usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentType: text("agent_type", { enum: ["main", "subagent"] })
    .notNull()
    .default("main"),
  provider: text("provider"),
  modelId: text("model_id"),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  toolCallCount: integer("tool_call_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type CiEvent = typeof ciEvents.$inferSelect;
export type NewCiEvent = typeof ciEvents.$inferInsert;
export type SyncConnection = typeof syncConnections.$inferSelect;
export type NewSyncConnection = typeof syncConnections.$inferInsert;
export type Mirror = typeof mirrors.$inferSelect;
export type NewMirror = typeof mirrors.$inferInsert;
export type Spec = typeof specs.$inferSelect;
export type NewSpec = typeof specs.$inferInsert;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type NewVerificationResult = typeof verificationResults.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
