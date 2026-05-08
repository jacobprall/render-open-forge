import { describe, test, expect, mock } from "bun:test";

process.env.GATEWAY_API_SECRET = "test-secret";

mock.module("../src/platform", () => ({
  getPlatform: () => ({
    db: {
      execute: async () => [{ "?column?": 1 }],
    },
    webhooks: {
      handleForgejoWebhook: async () => {},
      handleForgejoEvent: async () => {},
    },
    ci: {
      handleResult: async () => {},
    },
  }),
}));

import { app } from "../src/index";

describe("Gateway routes", () => {
  describe("Health endpoint", () => {
    test("GET /api/health returns 200 without auth", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("healthy");
    });
  });

  describe("Auth middleware", () => {
    test("returns 401 without Authorization header", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: "test/repo", branch: "main" }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Missing Authorization header");
    });

    test("returns 401 with invalid token", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ repoPath: "test/repo", branch: "main" }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid API key");
    });
  });

  describe("Public routes bypass auth", () => {
    test("POST /api/webhooks/forgejo does not require auth", async () => {
      const res = await app.request("/api/webhooks/forgejo", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      });
      expect(res.status).not.toBe(401);
    });

    test("POST /api/ci/results does not require auth", async () => {
      const res = await app.request("/api/ci/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(401);
    });
  });
});
