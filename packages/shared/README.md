# @openforge/shared

Lightweight shared types, error classes, constants, and stream event definitions used across all packages and apps in the monorepo.

## Purpose

This is intentionally minimal — a leaf package providing pure types and utilities with no heavy runtime dependencies. Business logic lives in `packages/platform`; UI utilities live in `packages/ui`.

## Entry Points

| Import path | Use case |
|---|---|
| `@openforge/shared` | Server-safe — full export surface |
| `@openforge/shared/client` | Client-safe — no `node:*`, Redis, or server-only modules. Use from `"use client"` components. |
| `@openforge/shared/lib/*` | Direct lib imports (e.g. `shared/lib/stream-types`) |

## What's Included

- **Error hierarchy** — `AppError` base class plus domain errors (`AuthError`, `ForgeError`, `SandboxError`, `SessionError`, `ValidationError`, etc.)
- **Stream event types** — typed definitions for agent↔client streaming
- **API types** — `ApiResponse`, `ApiErrorResponse`, `isApiError` helper
- **Model catalog** — `MODEL_DEFS` with `ModelDef` / `ModelSummary` types
- **CI utilities** — JUnit XML and TAP output parsers for test results
- **Helpers** — `generateRequestId`, `getRequestIdFromHeaders`, structured `logger`

## Dependencies

- `zod` — schema validation
- `@openforge/db` — type imports only (Drizzle schema types)

No database connections, no Redis, no network calls at runtime.
