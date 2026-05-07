# render-open-forge

A self-hosted coding agent and git forge you deploy and own entirely. Repository hosting, pull requests, CI runners, and an AI coding agent — running on your infrastructure, governed by your policies, with no per-seat fees.

render-open-forge replaces the stack most teams piece together from GitHub/GitLab, Copilot/Cursor, and GitHub Actions with a single deploy-once platform backed by Forgejo, a Bun-based agent worker, and Render's infrastructure primitives.

No per-seat licensing. No vendor-locked AI features. No opaque SaaS boundaries between your code and your tools.

## What it replaces

| Capability | Typical stack | render-open-forge |
|---|---|---|
| Repository hosting | GitHub/GitLab ($4–21/user/mo) | Forgejo (self-hosted, $0/user) |
| AI coding agent | Copilot/Cursor ($19–40/user/mo) | Built-in agent (pay only for LLM API tokens) |
| CI/CD | GitHub Actions / GitLab CI (per-minute billing) | Forgejo Actions runner (flat compute cost) |
| Code review | Built into GitHub/GitLab | Built into Forgejo + agent-assisted review |
| Data ownership | Vendor-hosted | Postgres you control |

### Estimated monthly cost

Infrastructure is flat — it doesn't scale with headcount.

| Component | Render plan | Est. cost |
|---|---|---|
| Web app (Next.js) | Starter | $7 |
| Agent worker | Starter | $7 |
| Sandbox (Docker) | Standard + 20 GB disk | ~$29 |
| Forgejo (git forge) | Standard + 10 GB disk | ~$27 |
| CI runner | Starter | $7 |
| Redis | Starter | $10 |
| Postgres | Basic 256 MB | $7 |
| **Infrastructure total** | | **~$94/mo** |

LLM costs (Anthropic / OpenAI) depend on usage. A team of 10 engineers averaging 20 agent sessions/day typically runs $200–400/mo in API tokens. Scale the worker plan and add runner instances as your team grows — the marginal cost is compute, not licenses.

**Comparison at different team sizes:**

| Team size | GitHub + Copilot + Actions* | render-open-forge |
|---|---|---|
| 5 engineers | ~$165/mo | ~$194/mo (infra + ~$100 LLM) |
| 20 engineers | ~$660/mo | ~$394/mo (infra + ~$300 LLM) |
| 50 engineers | ~$1,650/mo | ~$694/mo (infra + ~$600 LLM) |
| 100 engineers | ~$3,300/mo | ~$1,094/mo (infra + ~$1,000 LLM) |

<sub>*GitHub Team ($4/user) + Copilot Business ($19/user) + Actions (~$10/user for moderate CI). Real-world GitHub Actions bills vary widely. render-open-forge LLM estimates assume moderate agent usage; heavy usage (autonomous debugging, large refactors) will be higher.</sub>

## Architecture

A five-service system plus managed Postgres and Redis:

```
┌─────────────────────────────────────────────────────────┐
│                    Render Platform                       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Web App  │  │  Agent   │  │    CI    │              │
│  │ (Next.js) │  │ (Worker) │  │ (Runner) │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │             │                     │
│       ├──────────────┼─────────────┤                     │
│       │              │             │                     │
│  ┌────▼─────┐  ┌─────▼────┐  ┌────▼─────┐              │
│  │ Forgejo  │  │ Sandbox  │  │ Postgres │  ┌─────────┐  │
│  │ (Forge)  │  │ (Docker) │  │          │  │  Redis  │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
│                                                         │
│  All services communicate over Render's private network │
└─────────────────────────────────────────────────────────┘
```

- The **web app** handles authentication (Forgejo OAuth), sessions, chat UI, the REST API, and SSE streaming. It serves the full forge browser — repositories, file trees, commits, pull request diffs, Actions logs, organization management, skill settings, and model selection.
- The **agent worker** is a persistent Bun process that reads jobs from a Redis Streams queue, drives multi-step LLM execution, calls tools, and streams results back to the browser. No serverless timeouts — a 30-minute run is a normal run.
- The **sandbox** is an isolated Docker container (no public IP, bearer-token auth) providing filesystem, shell, git, and search access. The agent interacts with it through tools over an internal HTTP API. Add any runtime or tool by editing the Dockerfile.
- **Forgejo** is a full-featured git forge (GitHub/GitLab-compatible) running as a private service. It hosts repositories, pull requests, code review, branch protection, organizations, and Forgejo Actions CI — all inside your deployment. It also serves as the identity provider (OAuth2), the skill storage backend (git-backed markdown), and the webhook source that drives the agent's CI reactions.
- The **CI runner** executes Forgejo Actions workflows (GitHub Actions-compatible YAML). It runs as a Render Worker connected to Forgejo over the private network. Add more runner instances to increase parallelism.
- **Postgres** stores everything: sessions, chats, agent runs, skills cache, specs, CI events, sync connections, mirrors, usage events, verification results. Drizzle ORM, one canonical schema, queryable with any Postgres client.
- **Redis** handles the job queue (Streams + consumer groups), Pub/Sub for live SSE, worker heartbeats, and the `ask_user_question` back-channel (BLPOP blocking read).

## Architectural decisions

### Worker process, not serverless

The agent runs as a persistent Bun worker process (a Render Worker service), not as a serverless function or one-shot workflow step.

Agent runs are not subject to function timeouts. A run that takes 30 minutes to read a large codebase, draft a plan, write code, run tests, and iterate is just a normal run. The worker keeps going until the job reaches a terminal state.

Beyond that, a persistent process gives you:

- No cold start penalty on job pickup — the worker is always running.
- Long-lived Redis connections mean the worker can use `XREADGROUP` blocking reads with no polling overhead.
- In-memory state (accumulated assistant message parts, per-run tool state) is naturally scoped to the process lifetime, not serialized in and out on every step.
- Bounded concurrency is enforced in-process with a simple counter rather than requiring an external scheduler.

### Redis Streams job queue

Jobs are enqueued with `XADD` and consumed with `XREADGROUP`. Each job stays in the Pending Entry List until the worker calls `XACK` after reaching a terminal state (completed, aborted, or failed). If the worker dies mid-run, the job is automatically reclaimed by the next worker via a periodic `XPENDING` + `XCLAIM` cycle.

This gives at-least-once delivery without a separate queue service, using the same Redis instance already needed for Pub/Sub.

### A sandbox you control

The sandbox is a Docker image you own (`packages/sandbox/Dockerfile`). The default image ships with Node, Bun, Python, ripgrep, git, and standard build tools. Add any language, runtime, or tool by editing the Dockerfile — the agent will have access to it immediately.

On Render, the sandbox runs as a private service: it has no public IP, no ingress from the internet, and is reachable only from other services in the same deployment via its internal hostname. All requests require an `Authorization: Bearer` token. `/health` is the only unauthenticated endpoint, for Render's readiness probe.

### Separation of concerns

The agent does not run inside the execution environment. It runs alongside it and interacts through tools — file read/write, shell execution, grep, git, glob — over an internal HTTP API.

That separation matters:

- The agent can make decisions, call tools, and accumulate context across many LLM turns without touching the filesystem until it is ready
- The sandbox is a dumb execution surface with no knowledge of the agent protocol or model being used
- The two can be scaled, replaced, and debugged independently

### Forgejo as the backbone

Forgejo is more than a git host — it is the system's identity provider, webhook source, CI orchestrator, and skill storage backend:

- **Authentication:** Users sign in via Forgejo OAuth2. The web app never stores passwords; Forgejo handles credentials, 2FA, and external identity providers (Google OAuth configured inside Forgejo's admin panel).
- **Skill storage:** User skills are stored as markdown files in a per-user `forge-skills` Forgejo repository. Repo-level skills live under `.forge/skills/*.md` in project repos. Both are resolved from Forgejo's git contents API at session start — no separate storage layer.
- **Webhooks → agent reactions:** Forgejo webhook events (workflow completion, PR activity, push, review comments) are routed to the web app, which records CI events and enqueues agent jobs when intervention is needed (CI failure auto-fix, review comment response, auto-merge on success).
- **CI:** Forgejo Actions runs GitHub Actions-compatible YAML workflows. The agent can read job logs, fetch PR diffs, and diagnose failures through dedicated tools — all against the same Forgejo instance.

### Forge-agnostic provider

All forge operations (repos, PRs, branches, reviews, CI, mirrors, orgs, secrets, webhooks) go through a normalized `ForgeProvider` interface. The default adapter is Forgejo. The interface supports GitHub and GitLab adapters — swap the backing forge without changing agent tools or API routes.

### Skills replace workflows

The original phase-based workflow engine (understand → spec → execute → verify → deliver) has been replaced by a composable **skill system**. Instead of hard-coded phases dictating what the agent does and when, behavior is controlled by which skills are active on a session.

Skills are markdown files with YAML frontmatter. They are resolved from three sources at session start and injected into the agent's system prompt:

| Source | Location | Scope |
|---|---|---|
| **Built-in** | `packages/skills/builtins/*.md` | Ship with the platform |
| **User** | `{username}/forge-skills/skills/*.md` on Forgejo | Per-user, across all repos |
| **Repo** | `.forge/skills/*.md` in the project repo | Per-project |

Default active skills: Implementation, Verification, PR Delivery, Code Quality, React Best Practices, Next.js Best Practices. Users toggle skills per-session; repo-level skills auto-activate.

This model is more flexible than phased workflows:

- A team that wants spec-first development enables the **Spec-first** skill — the agent will produce a structured spec via `submit_spec` and wait for approval before coding
- A team that wants thorough exploration enables the **Thorough understanding** skill — the agent reads the codebase and asks clarifying questions before editing
- A team that wants to ship fast disables verification skills and lets CI catch issues
- Custom skills can encode any project-specific instructions, conventions, or constraints

Skills are installable from any URL via the Settings UI, seeded from builtins on first login, and editable directly in the Forgejo skills repo.

### Worker persists assistant messages

The worker writes the assistant `chat_messages` row to Postgres after a run completes (or when a run is aborted with partial output). The `done` and `aborted` stream events carry the persisted `assistantMessageId` back to the browser. The client replaces its in-memory streaming bubble with the server-assigned ID, so a page reload always shows the full conversation history.

### The data is yours

All application data (sessions, chat history, agent runs, skills, specs, verification results, CI events, mirrors, usage tracking) lives in a Postgres database you control. The schema is defined in `packages/db/schema.ts` and managed with Drizzle. You can connect a Postgres client, run queries, write reports, or evolve the schema. Nothing is stored in opaque vendor storage.

## Current capabilities

**Agent tools**

The agent has deep forge integration — not just file I/O, but first-class pull request, review, and CI operations:

| Tool | Description |
|---|---|
| `bash` | Shell execution in the sandbox |
| `read_file`, `write_file`, `edit` | Filesystem operations |
| `glob`, `grep` | Code search |
| `git` | Full git operations (clone, commit, push, branch, rebase) — automatic forge authentication |
| `create_pull_request` | Open PRs against the forge |
| `merge_pr`, `close_pr` | PR lifecycle management |
| `review_pr`, `approve_pr` | Submit code reviews with inline comments |
| `add_pr_comment`, `resolve_comment` | PR discussion and thread resolution |
| `request_review` | Request reviewers on a PR |
| `pull_request_diff` | Fetch unified diffs for review |
| `read_build_log` | Diagnose CI failures from Forgejo Actions job logs |
| `create_repo` | Provision new repositories on the forge |
| `submit_spec` | Structured technical specifications (goal, approach, files, risks, verification plan) |
| `web_fetch` | HTTP requests for documentation/APIs |
| `task` | Subagents — focused sub-runs with a reduced tool set and 20-step budget |
| `todo_write` | Structured task tracking across tool steps |
| `ask_user_question` | Synchronous user clarification — worker blocks on Redis BLPOP and resumes when the user answers |

**Skills**

- Three-tier resolution: built-in → user (personal Forgejo repo) → repo (`.forge/skills/*.md`)
- Built-in skills ship with the platform: Implementation, Verification, PR Delivery, Code Quality, Spec-first, Thorough Understanding, React/Next.js Best Practices, Postgres Optimization, Refactoring
- User skills stored as git-backed markdown in `{username}/forge-skills` on Forgejo — edit directly or install from any URL via Settings
- Repo skills auto-discovered from `.forge/skills/*.md` in the project repository
- Per-session skill selection — toggle any combination at session creation
- Skill files use YAML frontmatter (`name`, `description`, `default`) with a markdown body injected into the system prompt
- Framework builtins (React, Next.js) are automatically synced to the user's Forgejo skills repo

**Repository mirroring and external sync**

Connect GitHub and GitLab accounts via OAuth, browse remote repos, and import them into Forgejo with one click. Imported repos can be linked as mirrors:

- **Pull mirrors** keep Forgejo in sync with an external origin (default: every 8 hours + on-demand)
- **Push mirrors** push Forgejo commits back to GitHub/GitLab on every push
- **Bidirectional** mirrors combine both
- Conflict resolution strategies (force-push, rebase, manual) are configurable per-mirror
- A background cron scheduler syncs all active mirrors automatically

This lets teams adopt the forge incrementally — mirror your GitHub repos in, keep shipping PRs internally, and push changes back if needed.

**Webhook-driven CI reactions**

Forgejo webhooks are wired to the agent and session lifecycle:

- **CI failure → auto-fix:** when a Forgejo Actions workflow fails on a session's branch, the agent is automatically enqueued with the failure context to diagnose and fix (capped at configurable `maxCiFixAttempts`, default 3)
- **CI success + auto-merge:** if a session has `autoMerge` enabled and CI passes on an open PR, the forge merges it automatically
- **PR events:** new PRs, merges, and closures update session state; review comments trigger agent runs to address feedback
- **Push tracking:** file change counts roll up to the session for activity dashboards

**Web UI**

The web app is a full forge browser — not just an agent chat interface:

- **Repositories:** browse, create, import, search repos; file tree viewer, blob viewer with syntax highlighting, inline editor, commit history, commit diffs
- **Pull requests:** create, review, merge/close PRs; per-repo and global PR dashboard with filtering (open/merged/closed); AI-assisted review via the agent
- **Actions:** view Forgejo Actions runs and job logs; test results panel
- **Sessions:** create sessions against any repo/branch; real-time chat with SSE streaming; skill selection; model selection; spec review
- **Settings:** manage skills (install from URL, view builtins/user/repo skills), configure AI models, manage GitHub/GitLab sync connections, configure mirrors
- **Organizations:** create orgs, manage members, view usage dashboards (token consumption, sandbox minutes, storage)
- **Search:** cross-repo code search
- **Activity:** global activity feed

**Persistence and streaming**

- All state in Postgres: sessions, chats, messages, runs, specs, CI events, mirrors, sync connections, skill cache, verification results, PR events, usage events
- Real-time SSE streaming backed by Redis Pub/Sub for live events and a capped Redis Stream for replay
- Page reload mid-run rebuilds the same UI — the worker writes assistant messages with the same `parts` shape the browser renders
- Run cancellation via an abort flag polled on every LLM step

**Organization quotas and usage tracking**

Built-in per-org resource limits (configurable, no external billing service):

| Resource | Default limit |
|---|---|
| Model tokens | 10,000,000 |
| Sandbox minutes | 1,000 |
| Storage | 50 GB |
| Concurrent sessions | 5 |

Usage is tracked per-user via `usage_events` in Postgres (input/output/cached tokens, tool call counts, provider, model) and surfaced through the org usage API.

**Operations**

- At-least-once job delivery via Redis Streams with periodic `XPENDING` + `XCLAIM` reclaim of stale entries; dead-letter handling after max retries
- Worker heartbeat key in Redis; `/api/health/workers` exposes liveness
- Bounded per-worker concurrency (`MAX_CONCURRENT_RUNS`, default 5)
- Sandbox snapshots/restore with disk-pressure-aware garbage collection
- Path-jailed sandbox workspaces, bearer-secret authentication, runs as a non-root user
- Graceful drain on SIGTERM/SIGINT — worker finishes active runs before exiting

## Repo layout

```
apps/web                 Next.js 15 app — auth, sessions, chat UI, forge browser, REST API, SSE
packages/agent           Agent worker — tools, skills, subagents, Redis consumer
packages/db              Shared Drizzle schema (single source of truth)
packages/sandbox         Sandbox HTTP adapter + Bun server + Docker image
packages/shared          Shared types, forge provider abstraction, queue helpers
packages/skills          Skill types, resolution, builtins, provisioning, parsing
infrastructure/forgejo   Forgejo Dockerfile + app.ini config + setup script
infrastructure/runner    Forgejo Actions runner Dockerfile
```

## Local development

Infrastructure (Postgres, Redis, Forgejo, CI runner, sandbox) runs in Docker. The web app and agent worker run natively for hot reload.

**1. Clone and install**

```bash
git clone https://github.com/your-org/render-open-forge.git
cd render-open-forge
bun install
```

**2. Start infrastructure**

```bash
bun run infra:up
```

This starts Postgres, Redis, Forgejo, the CI runner (with Docker-in-Docker), and the sandbox. Forgejo will be available at `http://localhost:3000`.

**3. Run first-time Forgejo setup**

After Forgejo is healthy, create the admin user in the Forgejo UI at `http://localhost:3000`, then provision the agent service account and OAuth app:

```bash
bun run setup
```

This creates the `forge-agent` service account, generates API tokens, and registers the web app as an OAuth2 application. Copy the output values into your environment.

**4. Configure environment**

```bash
cp apps/web/.env.local.example apps/web/.env.local
cp packages/agent/.env.example packages/agent/.env
```

Fill in the values printed by the setup script, plus:

| Variable | Where | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `packages/agent/.env` | Required — at least one LLM provider key |
| `FORGEJO_AGENT_TOKEN` | `packages/agent/.env` | From setup script |
| `FORGEJO_OAUTH_CLIENT_ID` | `apps/web/.env.local` | From setup script |
| `FORGEJO_OAUTH_CLIENT_SECRET` | `apps/web/.env.local` | From setup script |

**5. Push the database schema**

```bash
bun run db:push
```

**6. Start the app and worker**

```bash
bun run dev
```

This starts Next.js on `http://localhost:4000` and the agent worker side by side via Turborepo. Sign in through Forgejo OAuth.

### Useful commands

```bash
bun run infra:logs     # tail Docker service logs
bun run infra:down     # stop containers (data volumes preserved)
bun run db:studio      # Drizzle Studio on http://localhost:4983
bun run typecheck      # check all packages
bun run test           # run tests
```

## Deploy to Render

The `render.yaml` blueprint defines all six services. Fork this repo, then:

**1. Provision the blueprint**

Go to [render.com/new/blueprint](https://render.com/new/blueprint) and connect your fork. Render provisions Postgres, Redis (Valkey), the web app, agent worker, sandbox, Forgejo, and the CI runner.

**2. Set environment variables**

After provisioning, set these in the Render dashboard:

| Variable | Service(s) | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Web, Agent | Required — at least one LLM provider key |
| `SANDBOX_SHARED_SECRET` | Web, Agent, Sandbox | Same value on all three. Generate with `openssl rand -hex 32` |
| `FORGEJO_EXTERNAL_URL` | Web | Public URL of your Forgejo instance |
| `FORGEJO_AGENT_TOKEN` | Web, Agent | Generated during Forgejo setup |
| `FORGEJO_OAUTH_CLIENT_ID` | Web | From Forgejo OAuth app registration |
| `FORGEJO_OAUTH_CLIENT_SECRET` | Web | From Forgejo OAuth app registration |
| `RUNNER_TOKEN` | Runner | From Forgejo admin → Actions → Runners |

**3. Run Forgejo setup**

Once Forgejo is live, create an admin account through its UI, then run the setup script from a Render Shell on the web service:

```bash
bun run setup
```

Or run it locally against the external Forgejo URL:

```bash
FORGEJO_INTERNAL_URL="https://your-forgejo-url.onrender.com" bun run setup
```

**4. Push the database schema**

From your laptop using the external Postgres URL:

```bash
DATABASE_URL="<external-url>?sslmode=require" bun run db:push
```

Or from a Render Shell on the web service:

```bash
bun run db:push
```

**5. Redeploy all services**

After setting secrets, redeploy so services pick up the new env vars.

**6. Verify**

- `https://<web-url>/api/health` → `{"status":"ok","database":"ok","redis":"ok"}`
- Sign in through Forgejo OAuth
- Check worker health: `https://<web-url>/api/health/workers` → `hasActiveWorkers: true`

## Environment variables

### Web service (`apps/web`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-wired by `render.yaml` |
| `REDIS_URL` | Yes | Auto-wired by `render.yaml` |
| `SESSION_SECRET` | Yes | Auto-generated by `render.yaml` |
| `FORGEJO_INTERNAL_URL` | Yes | Auto-wired (`http://forge-forgejo:3000`) |
| `FORGEJO_EXTERNAL_URL` | Yes | Public URL of your Forgejo instance |
| `FORGEJO_OAUTH_CLIENT_ID` | Yes | OAuth2 app Client ID from Forgejo |
| `FORGEJO_OAUTH_CLIENT_SECRET` | Yes | OAuth2 app Client Secret |
| `FORGEJO_AGENT_TOKEN` | Yes | Agent service account token |
| `ANTHROPIC_API_KEY` | Yes* | *At least one LLM provider key required |

### Agent worker (`packages/agent`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-wired by `render.yaml` |
| `REDIS_URL` | Yes | Auto-wired by `render.yaml` |
| `SANDBOX_SERVICE_HOST` | Yes | Auto-wired (`forge-sandbox:3001`) |
| `SANDBOX_SHARED_SECRET` | Yes | Must match web and sandbox |
| `FORGEJO_INTERNAL_URL` | Yes | Auto-wired |
| `FORGEJO_AGENT_TOKEN` | Yes | Agent service account token |
| `ANTHROPIC_API_KEY` | Yes* | *At least one LLM provider key required |
| `OPENAI_API_KEY` | No | Enables OpenAI models |
| `MAX_CONCURRENT_RUNS` | No | Default `5`; max parallel agent jobs per worker |
| `ASK_USER_TIMEOUT_SEC` | No | Default `900`; max time the worker blocks on `ask_user_question` |

### Sandbox service (`packages/sandbox`)

| Variable | Required | Notes |
|---|---|---|
| `SANDBOX_SHARED_SECRET` | Yes | Must match web and worker |
| `SANDBOX_SESSION_SECRET` | Yes | Session isolation secret |
| `WORKSPACE_ROOT` | No | Default `/workspace` |
| `PORT` | No | Default `3001` |

### Forgejo (`infrastructure/forgejo`)

| Variable | Required | Notes |
|---|---|---|
| `FORGEJO__database__*` | Yes | Auto-wired from Postgres by `render.yaml` |
| `FORGEJO__server__ROOT_URL` | Yes | External URL for link generation |
| `FORGEJO__oauth2__JWT_SECRET` | Yes | Auto-generated by `render.yaml` |

### CI Runner (`infrastructure/runner`)

| Variable | Required | Notes |
|---|---|---|
| `FORGEJO_URL` | Yes | Auto-wired (`http://forge-forgejo:3000`) |
| `RUNNER_TOKEN` | Yes | Registration token from Forgejo admin |

## Security

- Forgejo handles authentication and authorization — OAuth2 sign-in, repository permissions, branch protection rules, organization-level access control
- External identity providers (Google, etc.) are configured inside Forgejo's admin panel — the web app delegates all credential handling
- The sandbox runs as a Render Private Service: no public IP, no internet ingress, bearer-token authenticated, path-jailed workspaces
- The agent service account has scoped API tokens — it cannot escalate beyond its configured permissions
- All inter-service communication runs over Render's private network
- Session workspaces are isolated on disk in the sandbox container with session-scoped secrets
- Sync connection tokens (GitHub/GitLab) are stored encrypted in Postgres with automatic refresh

For production hardening: rotate `SANDBOX_SHARED_SECRET` and `FORGEJO_AGENT_TOKEN` periodically, enable Forgejo's built-in 2FA, and configure branch protection rules on critical repositories.

## Future work

- Multi-runner autoscaling based on CI queue depth
- Enhanced spec-driven development with approval gates and inline spec editing
- External integrations (Slack notifications, webhook triggers)
- Per-team usage dashboards and LLM cost attribution
- VM-level sandbox isolation for untrusted workloads

## Documentation

- [`DESIGN.md`](./DESIGN.md) — vision, architecture diagram, component responsibilities, data model, and design rationale
- [`TODO.md`](./TODO.md) — detailed roadmap and feature checklist

## License

Open source. See [LICENSE](./LICENSE) for details.
