import { Hono } from "hono";
import { getPlatform } from "../platform";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    const result = await getPlatform().db.execute("SELECT 1");
    checks.postgres = result ? "ok" : "error";
  } catch {
    checks.postgres = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json({ status: allOk ? "healthy" : "degraded", checks }, allOk ? 200 : 503);
});
