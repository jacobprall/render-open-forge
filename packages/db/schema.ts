import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Auth: Users (NextAuth identity — one per human)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),

  forgejoUserId: integer("forgejo_user_id").unique(),
  forgejoUsername: text("forgejo_username"),

  /** Set when the user completes invite password setup; bcrypt hash. */
  passwordHash: text("password_hash"),

  /** Platform admin — can manage platform-scoped LLM API keys and sees global key metadata. */
  isAdmin: boolean("is_admin").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Auth: Accounts (OAuth provider links — NextAuth standard)
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

// ---------------------------------------------------------------------------
// Auth: Verification Tokens (for future magic-link / email flows)
// ---------------------------------------------------------------------------

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
  ],
);

// ---------------------------------------------------------------------------
// Auth: Invites (signed invite URLs for onboarding test users)
// ---------------------------------------------------------------------------

export const invites = pgTable(
  "invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email"),
    forgejoUsername: text("forgejo_username").notNull(),
    /** Pre-provisioned app user row (no password until invite is accepted). */
    invitedUserId: text("invited_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    redeemedAt: timestamp("redeemed_at"),
    redeemedBy: text("redeemed_by").references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invites_token_idx").on(table.token)],
);

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

export type WorkflowMode = "full" | "standard" | "fast" | "yolo" | "autonomous";

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Forgejo login — for resolving user-scoped skills when OAuth token is unavailable (webhooks). */
    forgeUsername: text("forge_username"),
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

    // Workflow (legacy columns — prefer activeSkills for new sessions)
    phase: text("phase", {
      enum: ["understand", "spec", "execute", "verify", "deliver", "complete", "failed"],
    }).notNull().default("execute"),
    workflowMode: text("workflow_mode", {
      enum: ["full", "standard", "fast", "yolo", "autonomous"],
    }).notNull().default("standard"),

    /** Json array of { source: "builtin"|"user"|"repo", slug: string } */
    activeSkills: jsonb("active_skills").$type<
      Array<{ source: "builtin" | "user" | "repo"; slug: string }>
    >(),

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
// PR events (lifecycle tracking — feeds global PR view & future inbox)
// ---------------------------------------------------------------------------

export type PrEventAction =
  | "opened"
  | "closed"
  | "merged"
  | "ci_passed"
  | "ci_failed"
  | "review_requested"
  | "review_submitted"
  | "commented";

export const prEvents = pgTable(
  "pr_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    repoPath: text("repo_path").notNull(),
    prNumber: integer("pr_number").notNull(),
    action: text("action", {
      enum: [
        "opened",
        "closed",
        "merged",
        "ci_passed",
        "ci_failed",
        "review_requested",
        "review_submitted",
        "commented",
      ],
    }).notNull(),
    title: text("title"),
    /** Whether this event still requires user attention (for future inbox) */
    actionNeeded: boolean("action_needed").notNull().default(false),
    /** Whether user has seen/dismissed this event (for future inbox) */
    read: boolean("read").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("pr_events_user_id_idx").on(table.userId),
    index("pr_events_session_id_idx").on(table.sessionId),
    index("pr_events_action_needed_idx").on(table.userId, table.actionNeeded),
  ],
);

// ---------------------------------------------------------------------------
// Skill cache (optional mirror of git-backed skill files)
// ---------------------------------------------------------------------------

export const skillCache = pgTable(
  "skill_cache",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    repoPath: text("repo_path"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    source: text("source", {
      enum: ["builtin", "user", "repo"],
    }).notNull(),
    content: text("content").notNull(),
    filePath: text("file_path").notNull(),
    contentHash: text("content_hash").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    index("skill_cache_user_slug_idx").on(table.userId, table.slug),
    index("skill_cache_repo_slug_idx").on(table.repoPath, table.slug),
  ],
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
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
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
    enum: [
      "ci_running",
      "ci_failure",
      "ci_success",
      "review_comment",
      "pr_merged",
      "pr_closed",
    ],
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
// LLM API keys (encrypted at rest — plaintext only in memory when calling providers)
// ---------------------------------------------------------------------------

export const llmApiKeys = pgTable(
  "llm_api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    provider: text("provider", {
      enum: ["anthropic", "openai"],
    }).notNull(),
    scope: text("scope", {
      enum: ["platform", "user"],
    }).notNull(),
    /** Required when scope is `user`; must be null for platform keys. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("API key"),
    encryptedKey: text("encrypted_key").notNull(),
    /** Last few characters of the key for display (never the full secret). */
    keyHint: text("key_hint").notNull(),
    isValid: boolean("is_valid").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("llm_api_keys_user_id_idx").on(table.userId),
    index("llm_api_keys_scope_idx").on(table.scope),
    uniqueIndex("llm_api_keys_platform_provider_uidx")
      .on(table.provider)
      .where(sql`${table.scope} = 'platform'`),
    uniqueIndex("llm_api_keys_user_provider_uidx")
      .on(table.provider, table.userId)
      .where(sql`${table.scope} = 'user' and ${table.userId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export interface UserPreferencesData {
  defaultModelId?: string | null;
  defaultSubagentModelId?: string | null;
  defaultDiffMode?: "unified" | "split";
  defaultWorkflowMode?: "full" | "standard" | "fast" | "yolo";
  autoCommitPush?: boolean;
  autoCreatePr?: boolean;
  accentColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
}

export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  data: jsonb("data").$type<UserPreferencesData>().notNull().default({}),
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
export type SkillCacheRow = typeof skillCache.$inferSelect;
export type NewSkillCacheRow = typeof skillCache.$inferInsert;
export type PrEvent = typeof prEvents.$inferSelect;
export type NewPrEvent = typeof prEvents.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type LlmApiKeyRow = typeof llmApiKeys.$inferSelect;
export type NewLlmApiKeyRow = typeof llmApiKeys.$inferInsert;
