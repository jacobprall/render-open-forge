import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@render-open-forge/db/schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    const client = postgres(url, { max: 10, idle_timeout: 20 });
    _db = drizzle(client, { schema });
  }
  return _db;
}
