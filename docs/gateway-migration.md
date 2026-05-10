# Gateway-First Architecture Migration

> **Goal:** Make the Hono gateway the single canonical API layer. The Next.js web
> app becomes a pure rendering concern — pages, RSC data loading, and thin proxy
> routes that forward client-side requests to the gateway.

## Current Problems

1. **Near-complete API duplication** — 78 route handlers in `apps/web/app/api/`,
   ~50 in `apps/gateway/src/routes/`, covering the same domains.
2. **Gateway is barely used** — only `GET /api/models` proxies through it;
   everything else in the web app goes direct to `@openforge/platform`.
3. **Three independent `PlatformContainer` instances** — web, gateway, and agent
   worker all wire their own. Only gateway and agent genuinely need one.
4. **SSE streaming duplicated** — both web and gateway implement run-event
   replay, inbox polling, and CI log tailing.
5. **`@openforge/shared` is a grab-bag** — contains forge adapters, encryption,
   job queue, and run-stream helpers that also live in `@openforge/platform`.

## Target Architecture

```
Browser
  │
  ▼
apps/web (Next.js)
  • Pages / RSC / Client Components
  • NextAuth (login, session cookie → userId)
  • Thin API proxy routes → gatewayFetch()
  • RSC pages: direct platform reads for perf (server-side only)
  │
  │  gatewayFetch (internal network, GATEWAY_API_SECRET + X-OpenForge-User-Id)
  ▼
apps/gateway (Hono)
  • ALL REST endpoints (single source of truth)
  • SSE streaming (run events, inbox, CI logs)
  • Webhooks (Forgejo, GitHub, GitLab, Render)
  • MCP server
  • OpenAPI / Swagger docs
  • Auth: Bearer API key (external) | internal secret + user impersonation
  │
  ▼
@openforge/platform
  • PlatformContainer (services, DB, Redis)
  • Domain services (sessions, repos, PRs, orgs, projects, ...)
  • Forge provider abstraction (Forgejo, GitHub, GitLab)
  • Queue (Redis Streams) + Event bus (pub/sub)
  │
  ├─► apps/agent (Worker) — Redis consumer, LLM calls, sandbox exec
  └─► @openforge/db (schema only)
```

## Principles

1. **One API, one truth** — every HTTP endpoint lives in the gateway. The web app
   never re-implements API logic.
2. **Impersonation, not duplication** — `gatewayFetch` passes
   `X-OpenForge-User-Id`; the gateway resolves user context from the header when
   the request is authenticated via the internal secret.
3. **RSC reads are OK** — server components can query the DB directly via
   platform for initial page data (no extra hop). Only client-initiated fetches
   go through the proxy.
4. **Streaming is pass-through** — SSE endpoints in the web app become HTTP
   proxies that pipe the gateway's SSE response through to the browser.
5. **Shared is for types** — `@openforge/shared` holds types, errors, logger,
   and model catalog. Implementation code moves to `@openforge/platform`.

## Migration Phases

### Phase 1: Gateway Auth Enhancement

**File:** `apps/gateway/src/middleware/auth.ts`

Add user impersonation support: when the request is authenticated via
`GATEWAY_API_SECRET` and includes `X-OpenForge-User-Id`, resolve an `AuthContext`
for that specific user (not the admin fallback). This lets the web app proxy
requests on behalf of the logged-in user.

```
if (token === GATEWAY_API_SECRET && X-OpenForge-User-Id is present) {
  → resolve AuthContext for that user ID
} else if (token === GATEWAY_API_SECRET) {
  → resolve admin AuthContext (existing behavior)
} else {
  → resolve API key auth (existing behavior)
}
```

### Phase 2: Upgrade `gatewayFetch` Helper

**File:** `apps/web/lib/gateway.ts`

Enhance to:
- Accept a `userId` parameter and set `X-OpenForge-User-Id` header
- Forward request bodies with correct `Content-Type`
- Support SSE pass-through (return raw `Response` for streaming)
- Map gateway errors to Next.js `NextResponse` errors

### Phase 3: Add Missing Gateway Routes

Routes that exist in web but not in gateway:

| Domain | Routes to add |
|--------|---------------|
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `POST /api/projects/:id/repos`, `DELETE /api/projects/:id/repos/:path` |
| Search | `GET /api/search?q=` |
| Sync | `GET /api/sync/github/repos`, `GET /api/sync/gitlab/repos` |
| Webhooks | `POST /api/webhooks/render` |
| Metrics | `GET /api/metrics` |

### Phase 4: Convert Web API Routes to Proxies

Convert domain by domain. Each web `route.ts` becomes a thin proxy:

```typescript
// Before (direct platform call):
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json();
  const platform = getPlatform();
  const result = await platform.sessions.create({ ...body, userId: session.user.id });
  return NextResponse.json(result);
}

// After (gateway proxy):
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  return gatewayProxy(req, "/sessions", session.user.id);
}
```

**Order of conversion** (by dependency risk, lowest first):
1. Models (already done)
2. Projects (new domain, clean slate)
3. Inbox (read-heavy, simple)
4. Notifications
5. Skills
6. Mirrors
7. Settings
8. Search
9. Orgs / Invites
10. Sessions (most complex, highest traffic)
11. Repos / Pulls (most endpoints)
12. Webhooks / CI (public routes, different auth)
13. SSE Streaming (sessions, inbox, CI logs)

### Phase 5: Clean Up `@openforge/shared`

Move implementation code out of `@openforge/shared/lib/` into
`@openforge/platform`:

| Currently in shared | Move to |
|---------------------|---------|
| `lib/forge/*` (adapters, types, factory) | Already in `@openforge/platform/forge/` — delete from shared |
| `lib/forgejo/*` (client, webhooks, CI) | Already in `@openforge/platform/forgejo/` — delete from shared |
| `lib/encryption.ts` | Already re-exported from platform — delete from shared |
| `lib/api-key-resolver.ts` | Already re-exported from platform — delete from shared |
| `lib/llm-key-validation.ts` | Already re-exported from platform — delete from shared |
| `lib/job-queue.ts` | Already in `@openforge/platform/queue/` — delete from shared |
| `lib/run-stream.ts` | Already in `@openforge/platform/events/` — delete from shared |
| `lib/dead-letter.ts` | Already in platform — delete from shared |
| `lib/metrics.ts` | Already in platform — delete from shared |

**Keep in shared:** `errors.ts`, `api-types.ts`, `request-id.ts`, `logger.ts`,
`model-catalog.ts`, `stream-types.ts`, `ci/test-results.ts`, `client.ts`.

**Keep in shared/lib (UI utilities used by @openforge/ui):** `chat-parts.ts`,
`paste-blocks.ts`, `diff.ts`, `tool-state.ts`.

### Phase 6: Remove Dead Code

- Delete `apps/web/lib/db.ts` / `apps/web/lib/redis.ts` if no longer imported
  by API routes (RSC pages may still use them).
- Remove `@openforge/platform` from `apps/web/package.json` dependencies if
  only RSC server components use it (optional — platform for RSC reads is fine).
- Clean up web middleware rate-limiter references to non-existent paths
  (`/api/chat`, `/api/agent/stream`).

## Risk Mitigation

- **Feature parity check:** Before converting each domain, verify the gateway
  route handles all edge cases the web route does (error codes, validation,
  side effects like `after()` hooks).
- **Incremental rollout:** Convert one domain at a time, test, then proceed.
- **SSE is highest risk:** Streaming proxy requires careful handling of
  connection lifecycle, backpressure, and client disconnection.
- **OAuth flows stay in web:** OAuth redirect callbacks (`/api/oauth/*`) must
  remain in the web app since they set cookies and redirect the browser. These
  are not API routes in the traditional sense.
- **NextAuth stays in web:** `[...nextauth]` route handlers are inherently
  browser-session-based and stay in web.

## What Stays in Web

These routes remain in `apps/web` because they're browser-specific:

- `GET/POST /api/auth/[...nextauth]` — NextAuth session management
- `POST /api/auth/invite/accept` — browser flow (sets session, redirects)
- `GET /api/oauth/github` + `/callback` — OAuth redirect flow
- `GET /api/oauth/gitlab` + `/callback` — OAuth redirect flow
