-- Allow sessions without a repo (scratch/workbench mode)
ALTER TABLE "sessions" ALTER COLUMN "repo_path" DROP NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "branch" DROP NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "forge_type" DROP NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "forge_type" DROP DEFAULT;
ALTER TABLE "sessions" ALTER COLUMN "base_branch" DROP NOT NULL;
