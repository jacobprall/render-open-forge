# forge-web

Next.js 15 application that serves the Open Forge browser UI — auth, chat, code browser, settings, and SSE streaming.

## Quick Start

```bash
# From monorepo root (recommended)
bun run dev

# Or from this directory
next dev          # runs on port 4000
```

Production build:

```bash
next build && next start --port 4000
```

## Architecture

Route handlers are thin adapters that delegate to `@render-open-forge/platform` services through a singleton `PlatformContainer` instantiated in `lib/`. This keeps Next.js-specific code minimal and business logic testable outside the framework.

Authentication uses **NextAuth v5** (beta) with a credentials provider (email / password, hashed with bcryptjs) backed by a Drizzle adapter.

## Key Directories

| Path | Description |
|------|-------------|
| `app/` | Next.js App Router — pages, layouts, and API route handlers |
| `lib/` | Auth config, platform singleton, shared utilities |
| `components/` | React components (uses `@render-open-forge/ui` primitives) |

## Workspace Dependencies

- **`@render-open-forge/platform`** — core services (projects, agents, CI, etc.)
- **`@render-open-forge/db`** — Drizzle schema and migrations
- **`@render-open-forge/shared`** — types, constants, validation schemas
- **`@render-open-forge/ui`** — shared React component library
- **`@render-open-forge/skills`** — agent skill definitions
- **`@render-open-forge/ci-runner`** — CI job execution (imported for workflow dispatch)

## Notable External Dependencies

- `next` 15, `react` 19, `react-dom` 19
- `next-auth` v5 (beta) + `@auth/drizzle-adapter`
- `drizzle-orm` / `drizzle-kit` (DB tooling)
- `ioredis` (Redis for SSE streaming, pub/sub)
- `swr` (client-side data fetching)
- `tailwindcss` v4, `lucide-react` (icons)

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `next dev --port 4000` |
| `build` | `next build` |
| `start` | `next start --port 4000` |
| `typecheck` | `tsc --noEmit` |
| `db:push` | `drizzle-kit push` |
| `db:generate` | `drizzle-kit generate` |
| `db:studio` | `drizzle-kit studio` |
