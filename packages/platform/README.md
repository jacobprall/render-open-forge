# @openforge/platform

Framework-agnostic service layer for the OpenForge monorepo. Extracts all business logic into injectable, testable services so every app (web, gateway, agent) shares the same core through a single `PlatformContainer`.

## Quick Start

```typescript
import { createPlatform } from "@openforge/platform";

const platform = await createPlatform();
const sessions = await platform.sessions.list(authContext);
const repo = await platform.repos.get(authContext, repoId);
```

## Key Exports

| Export | Description |
|--------|-------------|
| `PlatformContainer` | Composition root holding all services and adapters |
| `createPlatform(config?)` | Creates a platform with its own DB/Redis connections |
| `createPlatformFromInstances({ db, redis, ... })` | Creates a platform reusing existing connections |

- **`createPlatform()`** — used by gateway and agent, which own their connections.
- **`createPlatformFromInstances()`** — used by the Next.js app, which passes in connections managed by the framework.

## Domain Services

Each service is a class that receives dependencies via constructor injection:

| Service | Responsibility |
|---------|---------------|
| `SessionService` | Agent session CRUD, messaging, auto-titling |
| `RepoService` | Repo import, file CRUD, agent config, secrets, branch protection, CI artifacts |
| `PullRequestService` | PR CRUD, comments, reviews, merge |
| `OrgService` | Orgs, members, secrets, usage |
| `InboxService` | Inbox items, counts, dismiss, mark read |
| `WebhookService` | Forgejo/GitHub/GitLab webhook handling |
| `CIService` | CI result processing |
| `SettingsService` | API keys |
| `SkillService` | Skill listing, install, sync |
| `MirrorService` | Mirror CRUD, sync, conflict resolution |
| `InviteService` | Invite creation, acceptance |
| `ModelService` | Available LLM model listing |
| `NotificationService` | Notification listing |

## Adapter Interfaces

Pluggable adapters live in `src/interfaces/` and allow swapping infrastructure without touching business logic:

| Adapter | Implementations |
|---------|----------------|
| `StorageAdapter` | S3, local filesystem, in-memory |
| `CacheAdapter` | Redis, in-memory |
| `CIDispatcher` | Render Workflows, noop |
| `NotificationSink` | Console, webhook, composite, noop |
| `AuthProvider` | Static token, composite |
| `QueueAdapter` | Redis Streams |
| `EventBusAdapter` | Redis Pub/Sub |

## Data Access

Services receive an injected Drizzle `db` instance directly — there is no repository abstraction layer. The database schema is defined in `@openforge/db`.

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  apps/web   │  │apps/gateway │  │ apps/agent  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────────────────────────────────────────┐
│          @openforge/platform            │
│  PlatformContainer { services + adapters }      │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌─────────────────┐ ┌────────┐ ┌──────────┐
   │   @openforge/db │ │ Redis  │ │ Storage  │
   └─────────────────┘ └────────┘ └──────────┘
```

## Example: Reusing Existing Connections (Next.js)

```typescript
import { createPlatformFromInstances } from "@openforge/platform";
import { db } from "@openforge/db";
import { redis } from "./redis";

const platform = await createPlatformFromInstances({ db, redis });
```

## Development

This package is part of the `openforge` monorepo. Build with:

```bash
pnpm --filter @openforge/platform build
```
