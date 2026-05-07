import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../packages/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
