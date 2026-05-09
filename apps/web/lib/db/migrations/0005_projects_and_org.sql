-- Projects and Org: organizational structure for OpenForge

-- 1. Orgs table (single row per deployment)
CREATE TABLE IF NOT EXISTS "orgs" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Projects table
CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "config" jsonb,
  "instructions" text,
  "is_scratch" boolean NOT NULL DEFAULT false,
  "created_by" text REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_slug_idx" ON "projects" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "projects_org_id_idx" ON "projects" ("org_id");
CREATE INDEX IF NOT EXISTS "projects_created_by_idx" ON "projects" ("created_by");

-- 3. Project repos table
CREATE TABLE IF NOT EXISTS "project_repos" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "repo_path" text NOT NULL,
  "forge_type" text,
  "default_branch" text DEFAULT 'main',
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_repos_project_repo_idx" ON "project_repos" ("project_id", "repo_path");
CREATE INDEX IF NOT EXISTS "project_repos_project_id_idx" ON "project_repos" ("project_id");

-- 4. Add org_id to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "org_id" text;

-- 5. Add project_id to sessions
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "project_id" text;
