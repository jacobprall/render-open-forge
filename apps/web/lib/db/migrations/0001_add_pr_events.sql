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
ALTER TABLE "pr_events" ADD CONSTRAINT "pr_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pr_events_user_id_idx" ON "pr_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "pr_events_session_id_idx" ON "pr_events" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "pr_events_action_needed_idx" ON "pr_events" USING btree ("user_id","action_needed");
