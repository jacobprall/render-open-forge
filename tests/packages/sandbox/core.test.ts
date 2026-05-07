import { afterEach, describe, expect, mock, test } from "bun:test";
import { verifySandboxSessionToken } from "../../../packages/sandbox/session-token";
import { HttpSandboxAdapter } from "../../../packages/sandbox";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("sandbox HTTP adapter", () => {
  test("sends session and auth headers to command endpoints", async () => {
    const requests: Request[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return jsonResponse({ stdout: "ok", stderr: "", exitCode: 0, timedOut: false });
    }) as typeof fetch;

    const adapter = new HttpSandboxAdapter("sandbox.internal", "secret");
    const result = await adapter.exec("session-1", "echo ok", 5000);

    expect(result).toEqual({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(requests[0].url).toBe("http://sandbox.internal/exec");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("X-Session-Id")).toBe("session-1");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret");
    expect(requests[0].headers.get("X-Sandbox-Session-Token")).toBeNull();
    expect(await requests[0].json()).toEqual({
      command: "echo ok",
      timeoutMs: 5000,
    });
  });

  test("maps adapter methods to their sandbox routes and response shapes", async () => {
    const urls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      urls.push(new URL(request.url).pathname);

      if (request.url.endsWith("/read")) return jsonResponse({ content: "file", exists: true });
      if (request.url.endsWith("/glob")) return jsonResponse({ files: ["a.ts"] });
      if (request.url.endsWith("/grep")) return jsonResponse({ matches: [] });
      if (request.url.endsWith("/git")) return jsonResponse({ stdout: "clean" });
      if (request.url.endsWith("/verify")) return jsonResponse([{ name: "test", status: "pass" }]);
      if (request.url.includes("/snapshot/")) return jsonResponse({ snapshotId: "snap-1" });
      if (request.url.includes("/restore/")) return new Response(null, { status: 204 });
      return jsonResponse({});
    }) as typeof fetch;

    const adapter = new HttpSandboxAdapter("sandbox.internal");

    await expect(adapter.readFile("s", "README.md")).resolves.toEqual({ content: "file", exists: true });
    await expect(adapter.glob("s", "**/*.ts")).resolves.toEqual(["a.ts"]);
    await expect(adapter.grep("s", "TODO", "src")).resolves.toEqual({ matches: [] });
    await expect(adapter.git("s", ["status"])).resolves.toEqual({ stdout: "clean" });
    await expect(adapter.verify("s", [{ name: "test", command: "bun test" }])).resolves.toEqual([
      { name: "test", status: "pass" },
    ]);
    await expect(adapter.snapshot("s", "snap-1")).resolves.toEqual({
      snapshotId: "snap-1",
    });
    await expect(adapter.restore("s", "snap-1")).resolves.toBeUndefined();

    expect(urls).toEqual([
      "/read",
      "/glob",
      "/grep",
      "/git",
      "/verify",
      "/snapshot/snap-1",
      "/restore/snap-1",
    ]);
  });

  test("includes signed session binding when session auth is configured", async () => {
    const requests: Request[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return jsonResponse({ stdout: "ok", stderr: "", exitCode: 0, timedOut: false });
    }) as typeof fetch;

    const adapter = new HttpSandboxAdapter("sandbox.internal", "secret", {
      secret: "session-secret",
      userId: "user-1",
    });
    await adapter.git("session-z", ["status"]);

    const hdr = requests[0]?.headers.get("X-Sandbox-Session-Token");
    expect(hdr).toBeTruthy();
    const claims = verifySandboxSessionToken(hdr!, "session-secret");
    expect(claims).toEqual({ sessionId: "session-z", userId: "user-1" });
  });

  test("surfaces failed sandbox requests with status and response body", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 500 })) as typeof fetch;
    const adapter = new HttpSandboxAdapter("sandbox.internal");

    await expect(adapter.writeFile("s", "a.txt", "content")).rejects.toThrow(
      "Sandbox request failed (500): nope",
    );
  });
});
