/**
 * MCP (Model Context Protocol) server for the platform.
 *
 * Exposes core platform operations as MCP tools so that any MCP-compatible
 * client (Claude Desktop, Cursor, custom agents) can interact with the
 * forge headlessly.
 *
 * Uses Streamable HTTP transport (web-standard variant) so it can be
 * mounted as a regular Hono route.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthContext } from "@render-open-forge/platform";
import type { PlatformContainer } from "@render-open-forge/platform/container";
import { getPlatform } from "../platform";

// ---------------------------------------------------------------------------
// Factory: build an McpServer with all tools registered
// ---------------------------------------------------------------------------

function textResult(obj: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function createMcpServer(auth: AuthContext): McpServer {
  const server = new McpServer(
    { name: "render-open-forge", version: "1.0.0" },
    {
      instructions:
        "This MCP server exposes the Render Open Forge platform. " +
        "Use session tools to create agent sessions, send messages, and manage runs. " +
        "Use repo tools to manage repositories, files, and CI. " +
        "Use org tools to manage organizations and members.",
    },
  );

  const p = getPlatform();

  registerSessionTools(server, p, auth);
  registerRepoTools(server, p, auth);
  registerPullRequestTools(server, p, auth);
  registerOrgTools(server, p, auth);
  registerSkillTools(server, p, auth);
  registerInboxTools(server, p, auth);
  registerMirrorTools(server, p, auth);
  registerModelTools(server, p, auth);

  return server;
}

// ---------------------------------------------------------------------------
// Session tools
// ---------------------------------------------------------------------------

function registerSessionTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("create-session", {
    title: "Create Session",
    description: "Create a new agent session for a repository and branch.",
    inputSchema: z.object({
      repoPath: z.string().describe("Repository path (e.g. owner/repo)"),
      branch: z.string().describe("Git branch name"),
      title: z.string().optional().describe("Session title"),
    }),
  }, async ({ repoPath, branch, title }) => {
    const result = await p.sessions.create(auth, { repoPath, branch, title });
    return textResult(result);
  });

  server.registerTool("send-message", {
    title: "Send Message",
    description: "Send a message to an agent session to start or continue work.",
    inputSchema: z.object({
      sessionId: z.string(),
      content: z.string().describe("The message content"),
      modelId: z.string().optional().describe("LLM model to use"),
    }),
  }, async ({ sessionId, content, modelId }) => {
    const result = await p.sessions.sendMessage(auth, sessionId, { content, modelId });
    return textResult(result);
  });

  server.registerTool("reply-to-agent", {
    title: "Reply to Agent",
    description: "Reply to an agent's tool call (e.g. ask_user response).",
    inputSchema: z.object({
      sessionId: z.string(),
      toolCallId: z.string(),
      message: z.string(),
    }),
  }, async ({ sessionId, toolCallId, message }) => {
    await p.sessions.reply(auth, sessionId, { toolCallId, message });
    return textResult({ ok: true });
  });

  server.registerTool("stop-session", {
    title: "Stop Session",
    description: "Stop the running agent in a session.",
    inputSchema: z.object({ sessionId: z.string() }),
  }, async ({ sessionId }) => {
    const result = await p.sessions.stop(auth, sessionId);
    return textResult(result);
  });

  server.registerTool("archive-session", {
    title: "Archive Session",
    description: "Archive a completed session.",
    inputSchema: z.object({ sessionId: z.string() }),
  }, async ({ sessionId }) => {
    await p.sessions.archive(auth, sessionId);
    return textResult({ ok: true });
  });

  server.registerTool("list-ci-events", {
    title: "List CI Events",
    description: "List CI events for a session.",
    inputSchema: z.object({ sessionId: z.string() }),
  }, async ({ sessionId }) => {
    const events = await p.sessions.listCiEvents(auth, sessionId);
    return textResult(events);
  });
}

// ---------------------------------------------------------------------------
// Repo tools
// ---------------------------------------------------------------------------

function registerRepoTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("import-repo", {
    title: "Import Repository",
    description: "Import an external git repository into the forge.",
    inputSchema: z.object({
      cloneAddr: z.string().describe("URL to clone from"),
      repoName: z.string().describe("Name for the imported repo"),
      repoOwner: z.string().optional().describe("Owner (defaults to current user)"),
      mirror: z.boolean().optional().describe("Set up as mirror"),
    }),
  }, async (args) => {
    const { repo } = await p.repos.importRepo(auth, args);
    return textResult(repo);
  });

  server.registerTool("get-file-contents", {
    title: "Get File Contents",
    description: "Read a file from a repository.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      filePath: z.string(),
      ref: z.string().optional().describe("Branch, tag, or commit SHA"),
    }),
  }, async ({ owner, repo, filePath, ref }) => {
    const result = await p.repos.getFileContents(auth, owner, repo, filePath, ref);
    return textResult(result);
  });

  server.registerTool("put-file-contents", {
    title: "Write File Contents",
    description: "Create or update a file in a repository.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      filePath: z.string(),
      content: z.string().describe("Base64-encoded file content"),
      message: z.string().describe("Commit message"),
      branch: z.string().optional(),
      sha: z.string().optional().describe("Current SHA for updates"),
    }),
  }, async ({ owner, repo, filePath, content, message, branch, sha }) => {
    const result = await p.repos.putFileContents(auth, owner, repo, filePath, { content, message, branch, sha });
    return textResult(result);
  });

  server.registerTool("get-agent-config", {
    title: "Get Agent Config",
    description: "Read .forge/agent.json configuration for a repository.",
    inputSchema: z.object({ owner: z.string(), repo: z.string() }),
  }, async ({ owner, repo }) => {
    const result = await p.repos.getAgentConfig(auth, owner, repo);
    return textResult(result);
  });

  server.registerTool("list-repo-secrets", {
    title: "List Repository Secrets",
    description: "List secrets configured on a repository.",
    inputSchema: z.object({ owner: z.string(), repo: z.string() }),
  }, async ({ owner, repo }) => {
    const result = await p.repos.listSecrets(auth, owner, repo);
    return textResult(result);
  });

  server.registerTool("get-test-results", {
    title: "Get Test Results",
    description: "Retrieve parsed test results for a CI run.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      runId: z.string(),
    }),
  }, async ({ owner, repo, runId }) => {
    const result = await p.repos.getTestResults(auth, owner, repo, runId);
    return textResult(result);
  });
}

// ---------------------------------------------------------------------------
// Pull Request tools
// ---------------------------------------------------------------------------

function registerPullRequestTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("create-pull-request", {
    title: "Create Pull Request",
    description: "Open a new pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string(),
      head: z.string().describe("Source branch"),
      base: z.string().describe("Target branch"),
      body: z.string().optional(),
    }),
  }, async ({ owner, repo, ...params }) => {
    const result = await p.pullRequests.createPullRequest(auth, owner, repo, params);
    return textResult(result);
  });

  server.registerTool("merge-pull-request", {
    title: "Merge Pull Request",
    description: "Merge an open pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      method: z.enum(["merge", "rebase", "squash"]).optional(),
    }),
  }, async ({ owner, repo, number, method }) => {
    const result = await p.pullRequests.mergePullRequest(auth, owner, repo, number, method);
    return textResult(result);
  });

  server.registerTool("list-pr-comments", {
    title: "List PR Comments",
    description: "List comments on a pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
    }),
  }, async ({ owner, repo, number }) => {
    const result = await p.pullRequests.listComments(auth, owner, repo, number);
    return textResult(result);
  });

  server.registerTool("create-pr-comment", {
    title: "Create PR Comment",
    description: "Post a comment on a pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      body: z.string(),
    }),
  }, async ({ owner, repo, number, body }) => {
    const result = await p.pullRequests.createComment(auth, owner, repo, number, { body });
    return textResult(result);
  });

  server.registerTool("submit-pr-review", {
    title: "Submit PR Review",
    description: "Submit a review on a pull request (approve, request changes, or comment).",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      event: z.enum(["approve", "request_changes", "comment"]),
      body: z.string().optional(),
    }),
  }, async ({ owner, repo, number, event, body }) => {
    const result = await p.pullRequests.submitReview(auth, owner, repo, number, { event, body });
    return textResult(result);
  });
}

// ---------------------------------------------------------------------------
// Org tools
// ---------------------------------------------------------------------------

function registerOrgTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("list-orgs", {
    title: "List Organizations",
    description: "List organizations the current user belongs to.",
  }, async () => {
    const orgs = await p.orgs.listOrgs(auth);
    return textResult(orgs);
  });

  server.registerTool("create-org", {
    title: "Create Organization",
    description: "Create a new organization.",
    inputSchema: z.object({
      login: z.string(),
      fullName: z.string().optional(),
      description: z.string().optional(),
    }),
  }, async (args) => {
    const org = await p.orgs.createOrg(auth, args);
    return textResult(org);
  });

  server.registerTool("list-org-members", {
    title: "List Org Members",
    description: "List members of an organization.",
    inputSchema: z.object({ orgName: z.string() }),
  }, async ({ orgName }) => {
    const members = await p.orgs.listMembers(auth, orgName);
    return textResult(members);
  });

  server.registerTool("get-usage", {
    title: "Get Usage",
    description: "Get usage metrics for the current user.",
  }, async () => {
    const usage = await p.orgs.getUsage(auth);
    return textResult(usage);
  });
}

// ---------------------------------------------------------------------------
// Skill tools
// ---------------------------------------------------------------------------

function registerSkillTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("list-skills", {
    title: "List Skills",
    description: "List available skills (builtin, user, and optionally repo-specific).",
    inputSchema: z.object({
      repoPath: z.string().optional().describe("Include repo-specific skills"),
    }),
  }, async ({ repoPath }) => {
    const result = await p.skills.listSkills(auth, repoPath);
    return textResult(result);
  });

  server.registerTool("install-skill", {
    title: "Install Skill",
    description: "Install a skill from a URL into the user's skill repository.",
    inputSchema: z.object({
      url: z.string().describe("URL to the skill markdown file"),
      slug: z.string().optional().describe("Custom slug for the skill"),
    }),
  }, async (args) => {
    const result = await p.skills.installSkill(auth, args);
    return textResult(result);
  });

  server.registerTool("sync-skills", {
    title: "Sync Skills",
    description: "Synchronize skills from remote sources.",
  }, async () => {
    await p.skills.syncSkills(auth);
    return textResult({ ok: true });
  });
}

// ---------------------------------------------------------------------------
// Inbox tools
// ---------------------------------------------------------------------------

function registerInboxTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("list-inbox", {
    title: "List Inbox",
    description: "List inbox items (PR events requiring attention).",
    inputSchema: z.object({
      filter: z.enum(["all", "unread", "action_needed"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }),
  }, async (params) => {
    const result = await p.inbox.list(auth, params);
    return textResult(result);
  });

  server.registerTool("inbox-count", {
    title: "Inbox Count",
    description: "Get unread count.",
  }, async () => {
    const count = await p.inbox.countUnread(auth);
    return textResult({ unread: count });
  });

  server.registerTool("dismiss-inbox", {
    title: "Dismiss Inbox Items",
    description: "Dismiss inbox items so they no longer surface.",
    inputSchema: z.object({
      eventIds: z.array(z.string()),
    }),
  }, async ({ eventIds }) => {
    await p.inbox.dismiss(auth, eventIds);
    return textResult({ ok: true });
  });
}

// ---------------------------------------------------------------------------
// Mirror tools
// ---------------------------------------------------------------------------

function registerMirrorTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("list-mirrors", {
    title: "List Mirrors",
    description: "List repository mirrors.",
    inputSchema: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
  }, async ({ limit, offset }) => {
    const result = await p.mirrors.list(auth, { limit: limit ?? 50, offset: offset ?? 0 });
    return textResult(result);
  });

  server.registerTool("sync-mirror", {
    title: "Sync Mirror",
    description: "Trigger a sync for a mirror.",
    inputSchema: z.object({ mirrorId: z.string() }),
  }, async ({ mirrorId }) => {
    const result = await p.mirrors.sync(auth, mirrorId);
    return textResult(result);
  });
}

// ---------------------------------------------------------------------------
// Model tools
// ---------------------------------------------------------------------------

function registerModelTools(
  server: McpServer,
  p: PlatformContainer,
  auth: AuthContext,
) {
  server.registerTool("list-models", {
    title: "List Models",
    description: "List available LLM models.",
  }, async () => {
    const result = await p.models.listModels(auth);
    return textResult(result);
  });
}

// ---------------------------------------------------------------------------
// Transport: per-session McpServer + WebStandard Streamable HTTP
// ---------------------------------------------------------------------------

const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

/**
 * Handle an incoming MCP HTTP request.
 * Creates a new transport per session (session ID from header or auto-generated).
 */
export async function handleMcpRequest(
  request: Request,
  auth: AuthContext,
): Promise<Response> {
  const sessionId = request.headers.get("mcp-session-id");

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    return transport.handleRequest(request);
  }

  const server = createMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  await server.connect(transport);

  if (transport.sessionId) {
    sessions.set(transport.sessionId, transport);
  }

  return transport.handleRequest(request);
}
