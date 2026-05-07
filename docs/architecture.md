# Architecture

## Authentication

OpenForge uses **NextAuth v5** with a **credentials provider** (email + password) backed by Postgres. Forgejo runs as headless infrastructure; users don't interact with its UI.

### How it works

- User accounts live in the `users` table (Drizzle schema) with a bcrypt `password_hash`. Each user has a linked `accounts` row containing a Forgejo API token, provisioned automatically at invite time.
- Sessions use **encrypted JWTs** (no server-side session store). The JWT carries the user's Forgejo token so server components and API routes can call the Forgejo API without an extra DB lookup.
- The Forgejo user account is created headlessly via the admin API when an invite is issued. Users never need to visit Forgejo or create an account there.

### First admin setup

On first startup, if the `users` table is empty, the app creates an admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD` and provisions the corresponding Forgejo user and API token. This runs via the Next.js instrumentation hook. See the [README](../README.md#local-development) for setup steps.

To run it manually instead (e.g., in CI or after clearing data):

```bash
bun run apps/web/scripts/bootstrap-admin.ts
```

### Inviting users

Authenticated users can invite others via `POST /api/invites`:

```bash
curl -X POST http://localhost:4000/api/invites \
  -H "Content-Type: application/json" \
  -b "authjs.session-token=..." \
  -d '{"username": "alice", "email": "alice@example.com"}'
```

This creates a Forgejo user, provisions an API token, and returns an invite URL. When the invited user visits the link, they set a password and are signed in automatically. The invite expires after 7 days.

### Key files

| File | Role |
|---|---|
| `apps/web/lib/auth/index.ts` | NextAuth config: Credentials provider, JWT + session callbacks |
| `apps/web/lib/auth/session.ts` | `getSession()` wrapper consumed by all server code |
| `apps/web/lib/auth/bootstrap.ts` | Auto-seed admin on first startup |
| `apps/web/lib/auth/providers/credentials.ts` | Email + password verification via bcrypt |
| `apps/web/lib/auth/invite-tokens.ts` | HMAC-signed invite token creation and verification |
| `apps/web/app/api/invites/route.ts` | Create and list invites |
| `apps/web/app/api/auth/invite/accept/route.ts` | Set password + redeem invite |
| `apps/web/app/invite/accept/page.tsx` | Password setup UI for invited users |

## Architectural decisions

### Persistent worker process

The agent runs as a persistent Bun worker process (a Render Worker service). Runs have no function timeouts. A 30-minute run that reads a large codebase, plans, writes code, runs tests, and iterates is normal.

Benefits:

- No cold start penalty. The worker is always running.
- Long-lived Redis connections enable `XREADGROUP` blocking reads with no polling overhead.
- In-memory state (accumulated assistant message parts, per-run tool state) is scoped to the process lifetime, not serialized on every step.
- Bounded concurrency via an in-process counter, no external scheduler needed.

### Redis Streams job queue

Jobs are enqueued with `XADD` and consumed with `XREADGROUP`. Each job stays in the Pending Entry List until the worker calls `XACK` after reaching a terminal state (completed, aborted, or failed). If the worker dies mid-run, the job is automatically reclaimed by the next worker via a periodic `XPENDING` + `XCLAIM` cycle.

This gives at-least-once delivery without a separate queue service, using the same Redis instance already needed for Pub/Sub.

### Sandbox

The sandbox is a Docker image (`packages/sandbox/Dockerfile`). The default image includes Node, Bun, Python, ripgrep, git, and standard build tools. Add any language or tool by editing the Dockerfile. `/health` is the only unauthenticated endpoint (for Render's readiness probe).

### Agent/sandbox separation

The agent runs alongside the sandbox, not inside it. It interacts through tools (file read/write, shell execution, grep, git, glob) over an internal HTTP API.

- The agent accumulates context across many LLM turns without touching the filesystem until it's ready
- The sandbox has no knowledge of the agent protocol or model
- The two scale and deploy independently

### CI execution (Render Workflows)

Forgejo holds repos and workflow YAML; **Render Workflows** runs the jobs.

1. Authors commit `.forgejo/workflows/*.yml` (GitHub Actions-shaped files).
2. Forgejo sends `push` / `pull_request` webhooks to the web app.
3. The web app loads workflow definitions from the repo via the Forge API, matches triggers, creates a `ci_events` row, sets a **pending** commit status on Forgejo, and calls **`render.workflows.startTask`** (or runs in-process when `CI_RUNNER_MODE=local`).
4. The **`forge-ci`** worker (`packages/ci-runner`) executes the registered task: shallow `git clone`, runs each **`run:`** step under `bash`, captures logs, scans for JUnit/TAP, then POSTs JSON to **`/api/ci/results`** with a shared **`CI_RUNNER_SECRET`**.
5. The web app validates the callback, updates Postgres, sets **success** / **failure** / **error** on the commit, and enqueues the agent on failure (same as before).

Render manages task retries, timeouts, and observability. No Docker-in-Docker or Forgejo runner container required.

### Forgejo

Forgejo serves as the code hosting surface, webhook source, CI orchestrator, and skill storage backend.

- **Code hosting:** Git repositories (clone/push over SSH and HTTP), branches and tags, pull requests, code review threads, merge strategies, organizations and teams, repo permissions, branch protection, and (optionally) mirrors.
- **Skill storage:** User skills are stored as markdown files in a per-user `forge-skills` Forgejo repository. Repo-level skills live under `.forge/skills/*.md` in project repos. Both are resolved from Forgejo's git contents API at session start.
- **Webhooks → CI dispatch + agent reactions:** `push` and `pull_request` events trigger CI when workflows under `.forgejo/workflows/` match (same semantics as GitHub Actions `on:`). The web app dispatches work to **Render Workflows** (production) or runs shell steps locally (`CI_RUNNER_MODE=local`). Completed runs POST results to `/api/ci/results`, update `ci_events`, and set Forgejo commit statuses. Separately, **`workflow_run`** webhooks (if you still use Forgejo Actions) record run outcomes; **`status`** webhooks are filtered so our own `ci/*` contexts do not duplicate events.
- **CI YAML:** Define pipelines as `.forgejo/workflows/*.yml`. Only **`run:`** shell steps are executed today (`uses:` / marketplace actions are ignored). The agent can still use forge tools to read Actions logs if you run classic Actions alongside this path.

### Forge-agnostic provider

All forge operations (repos, PRs, branches, reviews, CI, mirrors, orgs, secrets, webhooks) go through a `ForgeProvider` interface. The default adapter is Forgejo. GitHub and GitLab adapters are also supported, so the backing forge can be swapped without changing agent tools or API routes.

### Skill system

Agent behavior is controlled by which skills are active on a session. Skills replaced the original phase-based workflow engine (understand, spec, execute, verify, deliver).

Skills are markdown files with YAML frontmatter. They are resolved from three sources at session start and injected into the agent's system prompt:

| Source | Location | Scope |
|---|---|---|
| **Built-in** | `packages/skills/builtins/*.md` | Ship with the platform |
| **User** | `{username}/forge-skills/skills/*.md` on Forgejo | Per-user, across all repos |
| **Repo** | `.forge/skills/*.md` in the project repo | Per-project |

Default active skills: Implementation, Verification, PR Delivery, Code Quality, React Best Practices, Next.js Best Practices. Users toggle skills per-session; repo-level skills auto-activate.

Examples:

- Enable the **Spec-first** skill to have the agent produce a structured spec via `submit_spec` and wait for approval before coding
- Enable the **Thorough understanding** skill to have the agent read the codebase and ask clarifying questions before editing
- Disable verification skills to let CI catch issues instead
- Write custom skills to encode project-specific instructions, conventions, or constraints

Skills are installable from any URL via the Settings UI, seeded from builtins on first login, and editable directly in the Forgejo skills repo.

### Message persistence

The worker writes the assistant `chat_messages` row to Postgres after a run completes (or when a run is aborted with partial output). The `done` and `aborted` stream events carry the persisted `assistantMessageId` back to the browser. The client replaces its in-memory streaming bubble with the server-assigned ID, so a page reload shows the full conversation history.

### Data ownership

All application state lives in Postgres. The schema is defined in `packages/db/schema.ts` and managed with Drizzle. You can connect any Postgres client, run queries, or evolve the schema. See [capabilities.md](capabilities.md#persistence-and-streaming) for the full list of persisted entities.
