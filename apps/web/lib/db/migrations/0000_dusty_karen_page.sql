CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text,
	"phase" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"total_duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"model_messages" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"model_id" text DEFAULT 'anthropic/claude-sonnet-4-5',
	"active_run_id" text,
	"last_assistant_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"workflow_name" text,
	"run_id" text,
	"status" text,
	"logs_url" text,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mirrors" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"sync_connection_id" text NOT NULL,
	"forgejo_repo_path" text NOT NULL,
	"remote_repo_url" text NOT NULL,
	"direction" text NOT NULL,
	"last_sync_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"forge_username" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"forgejo_repo_path" text NOT NULL,
	"branch" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"pr_number" integer,
	"pr_status" text,
	"upstream_provider" text,
	"upstream_repo_url" text,
	"upstream_pr_url" text,
	"phase" text DEFAULT 'execute' NOT NULL,
	"workflow_mode" text DEFAULT 'standard' NOT NULL,
	"active_skills" jsonb,
	"project_config" jsonb,
	"project_context" text,
	"lines_added" integer DEFAULT 0,
	"lines_removed" integer DEFAULT 0,
	"ci_fix_attempts" integer DEFAULT 0 NOT NULL,
	"max_ci_fix_attempts" integer DEFAULT 3 NOT NULL,
	"last_activity_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"repo_path" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"content" text NOT NULL,
	"file_path" text NOT NULL,
	"content_hash" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"goal" text NOT NULL,
	"approach" text NOT NULL,
	"files_to_modify" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files_to_create" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"out_of_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_plan" text DEFAULT '' NOT NULL,
	"estimated_complexity" text DEFAULT 'small' NOT NULL,
	"rejection_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sync_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"remote_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text DEFAULT 'main' NOT NULL,
	"provider" text,
	"model_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"default_model_id" text DEFAULT 'anthropic/claude-sonnet-4-5',
	"default_subagent_model_id" text,
	"default_diff_mode" text DEFAULT 'unified',
	"default_workflow_mode" text DEFAULT 'standard',
	"auto_commit_push" boolean DEFAULT false NOT NULL,
	"auto_create_pr" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verification_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"check_name" text NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"exit_code" integer,
	"output" text DEFAULT '' NOT NULL,
	"stdout" text DEFAULT '' NOT NULL,
	"stderr" text DEFAULT '' NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_events" ADD CONSTRAINT "ci_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirrors" ADD CONSTRAINT "mirrors_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirrors" ADD CONSTRAINT "mirrors_sync_connection_id_sync_connections_id_fk" FOREIGN KEY ("sync_connection_id") REFERENCES "public"."sync_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specs" ADD CONSTRAINT "specs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_chat_id_idx" ON "agent_runs" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "agent_runs_session_id_idx" ON "agent_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chats_session_id_idx" ON "chats" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_cache_user_slug_idx" ON "skill_cache" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "skill_cache_repo_slug_idx" ON "skill_cache" USING btree ("repo_path","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_connections_user_provider_idx" ON "sync_connections" USING btree ("user_id","provider");