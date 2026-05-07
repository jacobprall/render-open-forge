import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "@/lib/db";

export async function runMigrations() {
  const db = getDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
}

export async function getMigrationStatus(): Promise<{
  hasPending: boolean;
  appliedCount: number;
}> {
  const db = getDb();
  const result = await db.execute<{ count: string }>(
    /* sql */ `SELECT COUNT(*) as count FROM __drizzle_migrations`,
  );
  const appliedCount = parseInt(result[0]?.count ?? "0", 10);
  return { hasPending: false, appliedCount };
}
