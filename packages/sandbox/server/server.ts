import { timingSafeEqual } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { verifySandboxSessionToken } from "../session-token";
import { runSecurityAudit, formatAuditReport } from "../lib/security-audit";
import type {
  ExecResult,
  GrepResult,
  GitResult,
  HealthResult,
  SnapshotResult,
  VerifyCheck,
  VerifyResult,
} from "../types";

const PORT = Number(process.env.PORT ?? 3001);
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/workspace";
const SNAPSHOT_DIR = process.env.SESSION_SNAPSHOT_DIR ?? "/workspace/snapshots";
const DEFAULT_EXEC_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_VERIFY_TIMEOUT_MS = 2 * 60 * 1000;
const SHARED_SECRET = process.env.SANDBOX_SHARED_SECRET;
const SESSION_SECRET = process.env.SANDBOX_SESSION_SECRET;

const DEFAULT_GIT_USER_NAME = process.env.SANDBOX_GIT_USER_NAME ?? "Forge Agent";
const DEFAULT_GIT_USER_EMAIL = process.env.SANDBOX_GIT_USER_EMAIL ?? "agent@render-open-forge.dev";

const ALLOWED_ENV_KEYS = new Set([
  "HOME",
  "USER",
  "PATH",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "TEMP",
  "NODE_ENV",
  "NODE_PATH",
  "BUN_INSTALL",
  "WORKSPACE_ROOT",
  "SESSION_SNAPSHOT_DIR",
  "PORT",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
]);

mkdirSync(SNAPSHOT_DIR, { recursive: true });

function childProcessEnv(extra?: Record<string, string>): Record<string, string> & NodeJS.ProcessEnv {
  const out: Record<string, string> = {};
  for (const k of ALLOWED_ENV_KEYS) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (ALLOWED_ENV_KEYS.has(k)) out[k] = v;
    }
  }
  return out as Record<string, string> & NodeJS.ProcessEnv;
}

function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? "unknown";
}

function jsonError(req: Request, status: number, code: string, message: string): Response {
  const requestId = getRequestId(req);
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: { "X-Request-Id": requestId } },
  );
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function checkAuth(req: Request): Response | null {
  if (!SHARED_SECRET) return null;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !constantTimeCompare(token, SHARED_SECRET)) {
    return jsonError(req, 401, "UNAUTHORIZED", "Unauthorized");
  }
  return null;
}

function checkSessionBinding(req: Request): Response | null {
  if (!SESSION_SECRET) return null;

  const sessionId = req.headers.get("x-session-id");
  const token = req.headers.get("x-sandbox-session-token");
  if (!sessionId || !token) {
    return jsonError(req, 401, "SESSION_BINDING_REQUIRED", "Missing session binding token");
  }

  const claims = verifySandboxSessionToken(token, SESSION_SECRET);
  if (!claims || claims.sessionId !== sessionId) {
    return jsonError(req, 401, "INVALID_SESSION_TOKEN", "Invalid session binding token");
  }

  return null;
}

function getSessionWorkspace(sessionId: string): string {
  return resolve(join(WORKSPACE_ROOT, sessionId));
}

function validatePath(sessionId: string, filePath: string): string {
  const sessionWs = getSessionWorkspace(sessionId);
  const resolved = resolve(join(sessionWs, filePath));

  const rootLen = sessionWs.length;
  const underRoot =
    resolved === sessionWs ||
    (resolved.length > rootLen && resolved.startsWith(sessionWs + sep));

  if (!underRoot) {
    throw new Error(`Path traversal attempt detected: ${filePath}`);
  }

  if (existsSync(resolved)) {
    let realRoot = sessionWs;
    if (existsSync(sessionWs)) {
      try {
        realRoot = realpathSync(sessionWs);
      } catch {
        realRoot = sessionWs;
      }
    }

    const realPath = realpathSync(resolved);
    const rrLen = realRoot.length;
    const underReal =
      realPath === realRoot ||
      (realPath.length > rrLen && realPath.startsWith(realRoot + sep));

    if (!underReal) {
      throw new Error(`Path escapes session workspace (symlink)`);
    }
  }

  return resolved;
}

function getSessionId(req: Request): string {
  const sessionId = req.headers.get("x-session-id");
  if (!sessionId || !sessionId.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new Error("Missing or invalid X-Session-Id header");
  }
  return sessionId;
}

function parseShellCommand(cmd: string): string[] {
  const trimmed = cmd.trim();
  if (!trimmed) return [];

  const out: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c as "'" | '"';
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

async function runArgv(
  argv: string[],
  cwd: string,
  timeoutMs = DEFAULT_EXEC_TIMEOUT_MS,
  extraEnv?: Record<string, string>,
): Promise<ExecResult> {
  const start = Date.now();
  if (argv.length === 0) {
    return { stdout: "", stderr: "empty command", exitCode: 1, timedOut: false, durationMs: 0 };
  }

  mkdirSync(cwd, { recursive: true });

  const proc = Bun.spawn(argv, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: childProcessEnv(extraEnv),
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  clearTimeout(timer);

  return { stdout, stderr, exitCode: exitCode ?? 1, timedOut, durationMs: Date.now() - start };
}

async function runCommand(
  command: string,
  cwd: string,
  timeoutMs = DEFAULT_EXEC_TIMEOUT_MS,
  env?: Record<string, string>,
): Promise<ExecResult> {
  const start = Date.now();
  mkdirSync(cwd, { recursive: true });

  const wrapped = `ulimit -u 256 2>/dev/null || true; ulimit -v 2097152 2>/dev/null || true; ${command}`;

  const proc = Bun.spawn(["bash", "-lc", wrapped], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: childProcessEnv(env),
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  clearTimeout(timer);

  return { stdout, stderr, exitCode: exitCode ?? 1, timedOut, durationMs: Date.now() - start };
}

async function handleCloneWorkspace(req: Request): Promise<Response> {
  const body = (await req.json()) as { fromSessionId?: string; toSessionId?: string };
  const fromSessionId = body.fromSessionId ?? "";
  const toSessionId = body.toSessionId ?? "";
  const idRe = /^[a-zA-Z0-9_-]+$/;
  if (!idRe.test(fromSessionId) || !idRe.test(toSessionId)) {
    return jsonError(req, 400, "SESSION_ID_INVALID", "Invalid session id");
  }
  if (fromSessionId === toSessionId) {
    return jsonError(req, 400, "VALIDATION_ERROR", "fromSessionId and toSessionId must differ");
  }

  const fromPath = getSessionWorkspace(fromSessionId);
  const toPath = getSessionWorkspace(toSessionId);
  if (!existsSync(fromPath)) {
    return jsonError(req, 404, "WORKSPACE_NOT_FOUND", "Source workspace does not exist");
  }

  if (existsSync(toPath)) {
    const rm = await runArgv(["rm", "-rf", toPath], "/", 120_000);
    if (rm.exitCode !== 0) {
      console.error("[clone-workspace] rm failed:", rm.stderr);
      return jsonError(req, 500, "CLONE_FAILED", "Could not clear target workspace");
    }
  }

  const result = await runArgv(["cp", "-a", fromPath, toPath], WORKSPACE_ROOT, 600_000);
  if (result.exitCode !== 0) {
    console.error("[clone-workspace] cp failed:", result.stderr);
    return jsonError(req, 500, "CLONE_FAILED", "Workspace copy failed");
  }

  return Response.json({ ok: true }, { headers: { "X-Request-Id": getRequestId(req) } });
}

async function handleExec(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { command: string; timeoutMs?: number };

  if (!body.command) {
    return jsonError(req, 400, "VALIDATION_ERROR", "command is required");
  }

  const cwd = getSessionWorkspace(sessionId);
  const result = await runCommand(body.command, cwd, body.timeoutMs);
  return Response.json(result);
}

async function handleRead(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { path: string };
  const MAX_READ_BYTES = 5 * 1024 * 1024;

  let filePath: string;
  try {
    filePath = validatePath(sessionId, body.path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes("traversal") || msg.includes("symlink") ? "PATH_TRAVERSAL" : "READ_FAILED";
    return jsonError(req, 400, code, msg);
  }

  if (!existsSync(filePath)) {
    return Response.json({ content: "", exists: false, errorCode: "not_found" });
  }

  const file = Bun.file(filePath);
  const size = file.size;
  if (size > MAX_READ_BYTES) {
    return Response.json({
      content: "",
      exists: false,
      errorCode: "too_large",
      errorMessage: `File is larger than ${MAX_READ_BYTES} bytes`,
    });
  }

  try {
    const content = await file.text();
    return Response.json({ content, exists: true });
  } catch (err) {
    return Response.json({
      content: "",
      exists: false,
      errorCode: "read_failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleWrite(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { path: string; content: string };

  let filePath: string;
  try {
    filePath = validatePath(sessionId, body.path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes("traversal") || msg.includes("symlink") ? "PATH_TRAVERSAL" : "WRITE_FAILED";
    return jsonError(req, 400, code, msg);
  }
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });

  await Bun.write(filePath, body.content);
  return Response.json({ ok: true });
}

async function handleGlob(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { pattern: string };

  const cwd = getSessionWorkspace(sessionId);
  if (!existsSync(cwd)) {
    return Response.json({ files: [] });
  }

  const glob = new Bun.Glob(body.pattern);
  const files = await Array.fromAsync(glob.scan({ cwd, onlyFiles: true }));

  return Response.json({ files });
}

async function handleGrep(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { pattern: string; path?: string };

  if (!body.pattern || typeof body.pattern !== "string") {
    return jsonError(req, 400, "VALIDATION_ERROR", "pattern is required");
  }

  let cwd: string;
  try {
    cwd = body.path ? validatePath(sessionId, body.path) : getSessionWorkspace(sessionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(req, 400, "PATH_TRAVERSAL", msg);
  }

  if (!existsSync(cwd)) {
    return Response.json({ matches: [] });
  }

  const proc = Bun.spawn(["rg", "--json", body.pattern, "."], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: childProcessEnv(),
  });

  await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  const matches: GrepResult["matches"] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as {
        type: string;
        data?: { path?: { text: string }; line_number?: number; lines?: { text: string } };
      };
      if (entry.type === "match" && entry.data) {
        matches.push({
          file: entry.data.path?.text ?? "",
          line: entry.data.line_number ?? 0,
          content: entry.data.lines?.text ?? "",
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  return Response.json({ matches });
}

async function handleGit(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { args: string[] };

  const safeArgs = body.args.filter((a) => typeof a === "string");
  const cwd = getSessionWorkspace(sessionId);

  const gitIdentityEnv = {
    GIT_AUTHOR_NAME: DEFAULT_GIT_USER_NAME,
    GIT_AUTHOR_EMAIL: DEFAULT_GIT_USER_EMAIL,
    GIT_COMMITTER_NAME: DEFAULT_GIT_USER_NAME,
    GIT_COMMITTER_EMAIL: DEFAULT_GIT_USER_EMAIL,
  };

  const result = await runArgv(["git", ...safeArgs], cwd, 60_000, gitIdentityEnv);
  const gitResult: GitResult = { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };

  return Response.json(gitResult);
}

async function handleSnapshot(req: Request, snapshotId: string): Promise<Response> {
  const sessionId = getSessionId(req);
  const sessionSnapDir = join(SNAPSHOT_DIR, sessionId);
  mkdirSync(sessionSnapDir, { recursive: true });
  const snapshotPath = join(sessionSnapDir, `${snapshotId}.tar.gz`);
  const sourcePath = getSessionWorkspace(sessionId);

  if (!existsSync(sourcePath)) {
    return jsonError(req, 404, "WORKSPACE_NOT_FOUND", "Session workspace does not exist");
  }

  const result = await runArgv(
    ["tar", "-czf", snapshotPath, "-C", WORKSPACE_ROOT, sessionId],
    WORKSPACE_ROOT,
    120_000,
  );

  if (result.exitCode !== 0) {
    console.error("[snapshot] tar failed:", result.stderr);
    return jsonError(req, 500, "SNAPSHOT_FAILED", "Failed to create snapshot");
  }

  const stat = Bun.file(snapshotPath);
  const sizeBytes = (await stat.exists()) ? stat.size : 0;

  const snapshotResult: SnapshotResult = { snapshotId, sizeBytes };
  return Response.json(snapshotResult, { headers: { "X-Request-Id": getRequestId(req) } });
}

async function handleRestore(req: Request, snapshotId: string): Promise<Response> {
  const sessionId = getSessionId(req);
  const snapshotPath = join(SNAPSHOT_DIR, sessionId, `${snapshotId}.tar.gz`);
  const targetPath = getSessionWorkspace(sessionId);

  if (!existsSync(snapshotPath)) {
    return jsonError(req, 404, "SNAPSHOT_NOT_FOUND", "Snapshot not found");
  }

  mkdirSync(targetPath, { recursive: true });
  const result = await runArgv(["tar", "-xzf", snapshotPath, "-C", WORKSPACE_ROOT], WORKSPACE_ROOT, 120_000);

  if (result.exitCode !== 0) {
    console.error("[restore] tar failed:", result.stderr);
    return jsonError(req, 500, "SNAPSHOT_RESTORE_FAILED", "Failed to restore snapshot");
  }

  return Response.json({ ok: true }, { headers: { "X-Request-Id": getRequestId(req) } });
}

async function handleVerify(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  const body = (await req.json()) as { checks: VerifyCheck[] };

  const cwd = getSessionWorkspace(sessionId);
  const results: VerifyResult[] = [];

  for (const check of body.checks) {
    const timeoutMs = check.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
    const needsShell = /[|&;<>$`\n\\]/.test(check.command);

    let result: ExecResult;
    if (needsShell) {
      result = await runCommand(check.command, cwd, timeoutMs);
    } else {
      const argv = parseShellCommand(check.command);
      result =
        argv.length > 0
          ? await runArgv(argv, cwd, timeoutMs)
          : await runCommand(check.command, cwd, timeoutMs);
    }

    let status: VerifyResult["status"];
    if (result.timedOut) {
      status = "timeout";
    } else if (result.exitCode === 0) {
      status = "pass";
    } else {
      status = "fail";
    }

    results.push({
      name: check.name,
      status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    });
  }

  return Response.json(results);
}

async function handleHealth(): Promise<Response> {
  let diskUsage = { totalBytes: 0, usedBytes: 0, freeBytes: 0, percentUsed: 0 };

  try {
    const stats = await statfs(WORKSPACE_ROOT);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    const percentUsed = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    diskUsage = { totalBytes, usedBytes, freeBytes, percentUsed };
  } catch {
    // ignore disk stat errors
  }

  const result: HealthResult = { status: "ok", diskUsage };
  return Response.json(result);
}

setInterval(async () => {
  try {
    const stats = await statfs(WORKSPACE_ROOT).catch(() => null);
    if (!stats) return;

    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    const percentUsed = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    if (percentUsed < 80) return;

    console.log(`[cleanup] Disk usage at ${percentUsed.toFixed(1)}%, cleaning old snapshots…`);

    const glob = new Bun.Glob("**/*.tar.gz");
    const snapshots: Array<{ path: string; mtime: number }> = [];

    for await (const file of glob.scan({ cwd: SNAPSHOT_DIR, onlyFiles: true })) {
      const fullPath = join(SNAPSHOT_DIR, file);
      const stat = Bun.file(fullPath);
      snapshots.push({ path: fullPath, mtime: (await stat.lastModified) ?? 0 });
    }

    snapshots.sort((a, b) => a.mtime - b.mtime);

    for (const snap of snapshots) {
      const currentStats = await statfs(WORKSPACE_ROOT).catch(() => null);
      if (!currentStats) break;

      const currentTotal = currentStats.blocks * currentStats.bsize;
      const currentFree = currentStats.bfree * currentStats.bsize;
      const currentUsed = currentTotal - currentFree;
      const currentPct = currentTotal > 0 ? (currentUsed / currentTotal) * 100 : 0;

      if (currentPct < 70) break;

      try {
        await Bun.file(snap.path).delete();
        console.log(`[cleanup] Removed snapshot: ${snap.path}`);
      } catch (delErr) {
        console.error(`[cleanup] Failed to remove ${snap.path}`, delErr);
      }
    }
  } catch (err) {
    console.error("[cleanup] Error:", err);
  }
}, 60 * 60 * 1000);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;

    console.log(`${method} ${path}`);

    try {
      if (method === "GET" && path === "/health") {
        return handleHealth();
      }

      if (method === "GET" && path === "/security-audit") {
        const authError = checkAuth(req);
        if (authError) return authError;
        const checks = await runSecurityAudit();
        const allPassed = checks.every((c) => c.passed || c.severity === "low");
        return Response.json({ ok: allPassed, checks, report: formatAuditReport(checks) });
      }

      const authError = checkAuth(req);
      if (authError) return authError;

      const sessionErr = checkSessionBinding(req);
      if (sessionErr) return sessionErr;

      if (method === "POST" && path === "/clone-workspace") return handleCloneWorkspace(req);
      if (method === "POST" && path === "/exec") return handleExec(req);
      if (method === "POST" && path === "/read") return handleRead(req);
      if (method === "POST" && path === "/write") return handleWrite(req);
      if (method === "POST" && path === "/glob") return handleGlob(req);
      if (method === "POST" && path === "/grep") return handleGrep(req);
      if (method === "POST" && path === "/git") return handleGit(req);
      if (method === "POST" && path === "/verify") return handleVerify(req);

      const snapshotMatch = path.match(/^\/snapshot\/([^/]+)$/);
      if (method === "POST" && snapshotMatch) {
        return handleSnapshot(req, snapshotMatch[1]!);
      }

      const restoreMatch = path.match(/^\/restore\/([^/]+)$/);
      if (method === "POST" && restoreMatch) {
        return handleRestore(req, restoreMatch[1]!);
      }

      return Response.json(
        { error: { code: "NOT_FOUND", message: "Not found", requestId: getRequestId(req) } },
        { status: 404, headers: { "X-Request-Id": getRequestId(req) } },
      );
    } catch (error) {
      const requestId = getRequestId(req);
      console.error(`[${requestId}] Request error:`, error);

      if (error instanceof Error) {
        const message = error.message;
        if (message.includes("traversal") || message.includes("symlink")) {
          return jsonError(req, 400, "PATH_TRAVERSAL", message);
        }
        if (message.includes("session-id") || message.includes("X-Session-Id")) {
          return jsonError(req, 400, "SESSION_ID_INVALID", message);
        }
      }

      return jsonError(req, 500, "INTERNAL_ERROR", "Internal server error");
    }
  },
});

console.log(`Sandbox server listening on port ${server.port}`);
