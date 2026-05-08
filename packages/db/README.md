# @render-open-forge/db

Shared [Drizzle ORM](https://orm.drizzle.team/) schema for the monorepo. All Postgres tables, column definitions, indexes, and TypeScript types live here so every app works against a single source of truth.

## Schema overview

The schema is defined in `schema.ts` using `drizzle-orm/pg-core`. Major tables:

| Domain | Tables |
|---|---|
| **Auth** | `users`, `accounts`, `verification_tokens`, `invites` |
| **Sessions** | `sessions` (agent workspaces tied to Forgejo repos) |
| **Chat** | `chats`, `chat_messages` |
| **Agent** | `agent_runs`, `specs`, `verification_results` |
| **CI / PR** | `ci_events`, `pr_events` |
| **Skills** | `skill_cache` |
| **Sync** | `sync_connections`, `mirrors` |
| **Platform** | `llm_api_keys`, `user_preferences`, `usage_events` |

## Exports

```ts
// schema + all table objects and inferred types
import { users, sessions, type Session, type NewSession } from "@render-open-forge/db/schema";

// re-exports everything from schema
import * as schema from "@render-open-forge/db";
```

Each table has `Select` and `Insert` types (e.g. `Session` / `NewSession`).

## Database connection

This package contains only the schema — it has no runtime database driver.
Each app creates its own Drizzle client (see `apps/web/lib/db/index.ts` for the `getDb()` singleton pattern using `postgres` + `drizzle-orm/postgres-js`).

## Schema management

From the repo root:

```bash
bun run db:push      # push schema changes to the database
bun run db:generate  # generate migration files
bun run db:studio    # open Drizzle Studio UI
```

These commands proxy into `apps/web` where `drizzle-kit` is configured.

## Used by

- `apps/web` — Next.js frontend & API routes
- `apps/agent` — autonomous coding agent
- `apps/gateway` — Hono API gateway
- `packages/platform` — shared platform services
