-- Decouple Forgejo: rename forgejo-specific columns to forge-agnostic names
-- and add forge_type to sessions so repos can live on any forge provider.

ALTER TABLE "sessions" RENAME COLUMN "forgejo_repo_path" TO "repo_path";
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "forge_type" text DEFAULT 'forgejo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mirrors" RENAME COLUMN "forgejo_repo_path" TO "local_repo_path";
--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "forgejo_username" DROP NOT NULL;
