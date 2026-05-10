import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestLogger } from "./middleware/logger";
import { onError } from "./middleware/error";
import { requireApiAuth, type GatewayEnv } from "./middleware/auth";

import { docsRoutes } from "./openapi";
import { healthRoutes } from "./routes/health";
import { sessionRoutes } from "./routes/sessions";
import { repoRoutes } from "./routes/repos";
import { pullRoutes } from "./routes/pulls";
import { orgRoutes } from "./routes/orgs";
import { inboxRoutes } from "./routes/inbox";
import { settingsRoutes } from "./routes/settings";
import { skillRoutes } from "./routes/skills";
import { mirrorRoutes } from "./routes/mirrors";
import { inviteRoutes } from "./routes/invites";
import { webhookRoutes } from "./routes/webhooks";
import { ciRoutes } from "./routes/ci";
import { modelRoutes } from "./routes/models";
import { notificationRoutes } from "./routes/notifications";
import { projectRoutes } from "./routes/projects";
import { searchRoutes } from "./routes/search";
import { streamRoutes } from "./routes/stream";
import { handleMcpRequest } from "./mcp/server";

const app = new Hono<GatewayEnv>();

app.onError(onError);
app.use("*", requestLogger);
app.use("*", cors());

// --- Public routes (no auth) ---
app.route("/api/docs", docsRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/ci", ciRoutes);

// --- Authenticated routes ---
app.use("/api/*", requireApiAuth);
app.route("/api/sessions", sessionRoutes);
app.route("/api/repos", repoRoutes);
app.route("/api/pulls", pullRoutes);
app.route("/api/orgs", orgRoutes);
app.route("/api/inbox", inboxRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/skills", skillRoutes);
app.route("/api/mirrors", mirrorRoutes);
app.route("/api/invites", inviteRoutes);
app.route("/api/models", modelRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/stream", streamRoutes);

// --- MCP endpoint (authenticated) ---
app.use("/mcp", requireApiAuth);
app.use("/mcp/*", requireApiAuth);
app.all("/mcp", async (c) => {
  const auth = c.get("auth");
  return handleMcpRequest(c.req.raw, auth);
});
app.all("/mcp/*", async (c) => {
  const auth = c.get("auth");
  return handleMcpRequest(c.req.raw, auth);
});

const port = Number(process.env.GATEWAY_PORT ?? 4100);

console.log(`[gateway] starting on port ${port}`);

export { app };

export default {
  port,
  fetch: app.fetch,
};
