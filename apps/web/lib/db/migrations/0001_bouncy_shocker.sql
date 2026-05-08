CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"hashed_key" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hashed_key_unique" UNIQUE("hashed_key")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"forgejo_username" text NOT NULL,
	"invited_user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"redeemed_at" timestamp,
	"redeemed_by" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "llm_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"scope" text NOT NULL,
	"user_id" text,
	"label" text DEFAULT 'API key' NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"repo_path" text NOT NULL,
	"pr_number" integer NOT NULL,
	"action" text NOT NULL,
	"title" text,
	"action_needed" boolean DEFAULT false NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"forgejo_user_id" integer,
	"forgejo_username" text,
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_forgejo_user_id_unique" UNIQUE("forgejo_user_id")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_api_keys" ADD CONSTRAINT "llm_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_events" ADD CONSTRAINT "pr_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_hashed_key_idx" ON "api_keys" USING btree ("hashed_key");--> statement-breakpoint
CREATE INDEX "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "llm_api_keys_user_id_idx" ON "llm_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "llm_api_keys_scope_idx" ON "llm_api_keys" USING btree ("scope");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_api_keys_platform_provider_uidx" ON "llm_api_keys" USING btree ("provider") WHERE "llm_api_keys"."scope" = 'platform';--> statement-breakpoint
CREATE UNIQUE INDEX "llm_api_keys_user_provider_uidx" ON "llm_api_keys" USING btree ("provider","user_id") WHERE "llm_api_keys"."scope" = 'user' and "llm_api_keys"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "pr_events_user_id_idx" ON "pr_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pr_events_session_id_idx" ON "pr_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pr_events_action_needed_idx" ON "pr_events" USING btree ("user_id","action_needed");--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "default_model_id";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "default_subagent_model_id";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "default_diff_mode";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "default_workflow_mode";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "auto_commit_push";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "auto_create_pr";