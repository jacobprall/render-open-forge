CREATE TABLE "infra_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"session_id" text,
	"kind" text NOT NULL,
	"spec_id" text,
	"resource_id" text,
	"input" jsonb,
	"output" jsonb,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"session_id" text,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb,
	"source" text NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"spec_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"status" text NOT NULL,
	"actual" jsonb NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_specs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"desired" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "infra_resources" ADD CONSTRAINT "infra_resources_spec_id_infra_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."infra_specs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infra_actions_project_id_idx" ON "infra_actions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "infra_actions_session_id_idx" ON "infra_actions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "infra_observations_project_id_idx" ON "infra_observations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "infra_observations_unacked_idx" ON "infra_observations" USING btree ("project_id","acknowledged");--> statement-breakpoint
CREATE INDEX "infra_resources_project_id_idx" ON "infra_resources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "infra_resources_external_id_idx" ON "infra_resources" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_specs_project_kind_name_idx" ON "infra_specs" USING btree ("project_id","kind","name");