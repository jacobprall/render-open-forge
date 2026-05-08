import { Hono } from "hono";
import { ciResultPayloadSchema } from "@render-open-forge/platform/services";
import { getPlatform } from "../platform";

export const ciRoutes = new Hono();

ciRoutes.post("/results", async (c) => {
  const secret = c.req.header("x-ci-secret") ?? "";
  const raw = await c.req.json();
  const body = ciResultPayloadSchema.safeParse(raw);
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  await getPlatform().ci.handleResult(secret, body.data);
  return c.json({ ok: true });
});
