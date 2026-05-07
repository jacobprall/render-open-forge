import { afterEach, describe, expect, mock, test } from "bun:test";
import { SharedHttpSandboxProvider } from "../../../packages/sandbox";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("SharedHttpSandboxProvider", () => {
  test("provision returns adapter bound to host", async () => {
    const p = new SharedHttpSandboxProvider("127.0.0.1:4000", "secret");
    const adapter = await p.provision("sess-1");
    expect(adapter).toBeDefined();
  });

  test("provision caches a single adapter instance", async () => {
    const p = new SharedHttpSandboxProvider("127.0.0.1:4000");
    const a = await p.provision("sess-1");
    const b = await p.provision("sess-2");
    expect(a).toBe(b);
  });

  test("deprovision is a no-op", async () => {
    const p = new SharedHttpSandboxProvider("127.0.0.1:4000");
    await expect(p.deprovision("sess-1")).resolves.toBeUndefined();
  });

  test("health reports ready when /health returns ok", async () => {
    globalThis.fetch = mock(
      async (input: RequestInfo | URL) => {
        const u = typeof input === "string" ? input : input.url;
        expect(u).toBe("http://127.0.0.1:4000/health");
        return new Response(
          JSON.stringify({
            status: "ok",
            diskUsage: { totalBytes: 100, usedBytes: 40, freeBytes: 60, percentUsed: 40 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ) as typeof fetch;

    const p = new SharedHttpSandboxProvider("127.0.0.1:4000");
    const h = await p.health("sess-1");
    expect(h.ready).toBe(true);
    expect(h.type).toBe("shared-http");
    expect(h.diskUsage).toEqual({ usedBytes: 40, totalBytes: 100 });
  });

  test("health reports not ready on network error", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("econnrefused");
    }) as typeof fetch;

    const p = new SharedHttpSandboxProvider("127.0.0.1:4000");
    const h = await p.health("sess-1");
    expect(h.ready).toBe(false);
  });
});
