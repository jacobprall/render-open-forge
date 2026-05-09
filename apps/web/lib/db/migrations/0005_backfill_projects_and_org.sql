-- Backfill: create org, projects from existing sessions, assign scratch projects

-- 1. Create the default org
INSERT INTO "orgs" ("id", "name", "slug")
VALUES ('org-default', 'My Organization', 'my-organization')
ON CONFLICT ("id") DO NOTHING;

-- 2. Set org_id on all existing users
UPDATE "users" SET "org_id" = 'org-default' WHERE "org_id" IS NULL;

-- 3. Create a project for each distinct non-null repoPath
INSERT INTO "projects" ("id", "org_id", "name", "slug", "is_scratch", "created_by")
SELECT
  'proj-' || md5(s.repo_path),
  'org-default',
  split_part(s.repo_path, '/', 2),
  replace(s.repo_path, '/', '-'),
  false,
  (SELECT id FROM users WHERE is_admin = true LIMIT 1)
FROM (SELECT DISTINCT repo_path FROM sessions WHERE repo_path IS NOT NULL) s
ON CONFLICT ("id") DO NOTHING;

-- 4. Create project_repos rows for each project
INSERT INTO "project_repos" ("id", "project_id", "repo_path", "forge_type", "default_branch", "is_primary")
SELECT
  'pr-' || md5(s.repo_path),
  'proj-' || md5(s.repo_path),
  s.repo_path,
  COALESCE(s.forge_type, 'github'),
  COALESCE(s.base_branch, 'main'),
  true
FROM (
  SELECT DISTINCT ON (repo_path) repo_path, forge_type, base_branch
  FROM sessions
  WHERE repo_path IS NOT NULL
  ORDER BY repo_path, created_at DESC
) s
ON CONFLICT DO NOTHING;

-- 5. Assign sessions with repos to their projects
UPDATE "sessions" s
SET "project_id" = 'proj-' || md5(s.repo_path)
WHERE s.repo_path IS NOT NULL AND s.project_id IS NULL;

-- 6. Create a scratch project for each user
INSERT INTO "projects" ("id", "org_id", "name", "slug", "is_scratch", "created_by")
SELECT
  'proj-scratch-' || u.id,
  'org-default',
  'Scratch',
  'scratch-' || u.id,
  true,
  u.id
FROM "users" u
ON CONFLICT ("id") DO NOTHING;

-- 7. Assign scratch sessions (no repoPath) to user's scratch project
UPDATE "sessions" s
SET "project_id" = 'proj-scratch-' || s.user_id
WHERE s.repo_path IS NULL AND s.project_id IS NULL;

-- 8. Fix infra_specs and infra_resources projectId if any exist
-- (Currently empty, but handle for future consistency)
