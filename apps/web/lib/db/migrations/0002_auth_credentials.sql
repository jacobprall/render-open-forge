-- Credentials auth + invite linkage (run via drizzle-kit push, or apply manually).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;

ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "invited_user_id" text;

-- Enable FK after backfilling invited_user_id for any existing rows, then:
-- ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_user_id_users_id_fk"
--   FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--
-- Fresh installs: prefer `bun run db:push` from repo root.
