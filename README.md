# OpenForge

An open-source self-hosted coding agent and git forge you deploy and own entirely. Repository hosting, pull requests, CI runners, and an AI coding agent on your infrastructure, with no per-seat fees.

Built on Forgejo, a Bun-based agent worker, **Render Workflows for CI execution**, and Render's infrastructure primitives.

## What it replaces

| Capability | Typical stack | render-open-forge |
|---|---|---|
| Repository hosting | GitHub/GitLab ($4–21/user/mo) | Forgejo (self-hosted, $0/user) |
| AI coding agent | Cursor Business ($40/user/mo + token markup) | Built-in agent (pay only for LLM API tokens at cost) |
| CI/CD | GitHub Actions / GitLab CI (per-minute billing) | Forgejo workflow YAML + **Render Workflows** execution (flat worker cost, scalable tasks) |
| Code review | Built into GitHub/GitLab | Built into Forgejo + agent-assisted review |
| Data ownership | Vendor-hosted | Postgres you control |

## Architecture

A three-tier system:

```mermaid
graph LR
    subgraph Clients
        direction TB
        Browser["Browser"]
        LLM["LLM APIs · Anthropic · OpenAI"]
    end

    subgraph Application
        direction TB
        Web["forge-web · Next.js"]
        Agent["forge-agent · Bun worker"]
        CI["forge-ci · Render Workflows"]
    end

    subgraph Infrastructure
        direction TB
        Forgejo["forge-forgejo · Git forge"]
        Sandbox["forge-sandbox · Docker"]
        Redis[("Redis · Valkey")]
        Postgres[("Postgres")]
    end
```

- **forge-web**: Next.js app serving auth, chat UI, REST API, SSE streaming, and the forge browser.
- **forge-agent**: persistent Bun worker. Reads jobs from Redis Streams, runs multi-step LLM execution, streams results back.
- **forge-ci**: Render Workflows task worker. Clones repos, runs CI shell steps, posts results to the web app.
- **forge-sandbox**: isolated Docker container (no public IP, bearer-token auth). Filesystem, shell, git, and search over an internal HTTP API.
- **forge-forgejo**: Forgejo running as a private service. Repos, PRs, code review, branch protection, orgs, CI workflow definitions.
- **Postgres**: all application state via Drizzle ORM.
- **Redis (Valkey)**: job queue (Streams), Pub/Sub for SSE, worker heartbeats.

## Repo layout

```
apps/web                 Next.js 15 app: auth, sessions, chat UI, forge browser, REST API, SSE, CI dispatch & callbacks
apps/agent               Agent worker: tools, skills, subagents, Redis consumer
apps/ci-runner           Render Workflows task worker: clone repo, run `run:` steps, POST results to web app
packages/db              Shared Drizzle schema
packages/sandbox         Sandbox HTTP adapter + Bun server + Docker image
packages/shared          Shared types, forge provider abstraction, queue helpers
packages/skills          Skill types, resolution, builtins, provisioning, parsing
infrastructure/forgejo   Forgejo Dockerfile + app.ini config + setup script
infrastructure/runner    Legacy Forgejo Actions runner image (optional, not used by the default Render blueprint)
```

## Local development

Infrastructure (Postgres, Redis, Forgejo, sandbox) runs in Docker. The web app and agent worker run natively for hot reload. **CI** runs via the web app: set `CI_RUNNER_MODE=local` so `push` / `pull_request` webhooks execute workflow steps on your machine (requires `git` and `bash`), or point `CI_RUNNER_MODE` at Render and supply `RENDER_API_KEY` to dispatch remote tasks.

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

This starts Postgres, Redis, Forgejo, and the sandbox. Forgejo will be at `http://localhost:3000` (admin-only, end users don't need it).

**3. Run first-time Forgejo setup**

After Forgejo is healthy, create the admin user in the Forgejo UI at `http://localhost:3000`, then provision the agent service account:

```bash
bun run setup
```

This creates the `forge-agent` service account and generates API tokens. Copy the output values into your environment.

**4. Configure environment**

There's a single `.env` at the **repo root**. The per-package locations Next.js
and the worker expect — `apps/web/.env`, `apps/web/.env.local`, and
`apps/agent/.env` — are symlinks back to it (already checked into the repo).
Edit the root file once; every process picks up the change.

```bash
cp .env.example .env
# then fill in the values
```

Fill in the values printed by the setup script, plus:

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Email for the first admin account |
| `ADMIN_PASSWORD` | Password for the first admin account |
| `ANTHROPIC_API_KEY` | Required, at least one LLM provider key |
| `FORGEJO_AGENT_TOKEN` | From setup script, needed for CI clone URLs and forge API |
| `FORGEJO_SANDBOX_URL` | `http://forgejo:3000` — hostname the sandbox container uses to reach Forgejo |
| `CI_RUNNER_MODE` | `local` to run CI on your host (default dev); `render` + `RENDER_API_KEY` to dispatch Render Workflows |
| `CI_RUNNER_SECRET` | Shared secret for `POST /api/ci/results` (any dev string; must match if you run `forge-ci` locally) |
| `RENDER_API_KEY` | Required when `CI_RUNNER_MODE=render` |

**5. Push the database schema**

```bash
bun run db:push
```

**6. Start the app and worker**

```bash
bun run dev
```

This starts Next.js on `http://localhost:4000` and the agent worker side by side via Turborepo. Sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD` credentials (auto-created on first startup).

### Useful commands

```bash
bun run infra:logs     # tail Docker service logs
bun run infra:down     # stop containers (data volumes preserved)
bun run db:studio      # Drizzle Studio on http://localhost:4983
bun run typecheck      # check all packages
bun run test           # run tests
```

## Deploy to Render

The `render.yaml` blueprint provisions all services shown in the architecture diagram. Fork this repo, then:

**1. Provision the blueprint**

Go to [render.com/new/blueprint](https://render.com/new/blueprint) and connect your fork.

**2. Set environment variables**

After provisioning, set these in the Render dashboard:

| Variable | Service(s) | Notes |
|---|---|---|
| `AUTH_SECRET` | Web | NextAuth encryption key. Generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Web | Email for the auto-bootstrapped admin account |
| `ADMIN_PASSWORD` | Web | Password for the auto-bootstrapped admin account |
| `ANTHROPIC_API_KEY` | Web, Agent | Required, at least one LLM provider key |
| `RENDER_API_KEY` | Web | Required for CI. Render Dashboard API key used to call **`render.workflows.startTask`** |
| `SANDBOX_SHARED_SECRET` | Web, Agent, Sandbox | Same value on all three. Generate with `openssl rand -hex 32` |
| `FORGEJO_EXTERNAL_URL` | Web | Public URL of your Forgejo instance |
| `FORGEJO_AGENT_TOKEN` | Web, Agent, **forge-ci** | Same token. CI clones and Forge HTTP API calls use this |
| `CI_CALLBACK_URL` | Web (optional) | Public **`https://<your-web-service>/api/ci/results`** if the worker cannot reach the default internal URL; otherwise omit |
| `RENDER_CI_WORKFLOW_SLUG` | Web | Optional, defaults to **`forge-ci`**. Must match the Workflow service slug shown in Render |

**Notes:** `CI_RUNNER_SECRET` is auto-generated on **`forge-web`** and linked into **`forge-ci`** via Blueprint `fromService`. Both services must share this value for callbacks to authenticate. Register Forgejo webhooks pointing at **`https://<web>/api/webhooks/forgejo`** (or your configured path) including **`push`** and **`pull_request`** events so CI dispatches fire.

**3. Run Forgejo setup**

Once Forgejo is live, create the Forgejo admin user through its UI (this is the infrastructure admin, separate from your OpenForge admin account), then run the setup script from a Render Shell on the web service:

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
- Sign in with your admin email and password
- Check worker health: `https://<web-url>/api/health/workers` → `hasActiveWorkers: true`
- In the Render dashboard, confirm the **`forge-ci`** worker is **Live** (it registers Render Workflow tasks on startup)

## Estimated cost

Infrastructure cost is flat and doesn't scale with headcount.

| Component | Render plan | Est. cost |
|---|---|---|
| Web app (Next.js) | Starter | $7 |
| Agent worker | Starter | $7 |
| Sandbox (Docker) | Standard + 20 GB disk | ~$29 |
| Forgejo (git forge) | Standard + 10 GB disk | ~$27 |
| CI worker (Render Workflows) | Starter | $7 |
| Redis | Starter | $10 |
| Postgres | Basic 256 MB | $7 |
| **Infrastructure total** | | **~$94/mo** |

LLM costs (Anthropic / OpenAI) depend on usage. A team of 10 engineers averaging 20 agent sessions/day typically runs $200–400/mo in API tokens. Scale the agent worker plan or Render Workflows concurrency as load grows.

**Comparison at different team sizes:**

| Team size | Cursor Business + GitHub + Actions* | render-open-forge |
|---|---|---|
| 5 engineers | ~$270/mo | ~$194/mo (infra + ~$100 LLM) |
| 20 engineers | ~$1,080/mo | ~$394/mo (infra + ~$300 LLM) |
| 50 engineers | ~$2,700/mo | ~$694/mo (infra + ~$600 LLM) |
| 100 engineers | ~$5,400/mo | ~$1,094/mo (infra + ~$1,000 LLM) |

<sub>*Cursor Business ($40/user) + GitHub Team ($4/user) + Actions (~$10/user for moderate CI). Cursor's seat price includes limited fast requests; heavy agentic usage burns through the included quota, and Cursor's effective per-token cost is higher than direct API access. render-open-forge calls LLM providers (Anthropic, OpenAI) at cost with your own API keys. LLM estimates assume moderate agent usage; heavy usage (autonomous debugging, large refactors) will be higher.</sub>

## Documentation

The `docs/` directory has the long-form material:

- [`docs/architecture.md`](docs/architecture.md): authentication, architectural decisions, Forgejo, skills system, data ownership
- [`docs/capabilities.md`](docs/capabilities.md): agent tools, skills, mirroring, CI reactions, web UI, persistence, org quotas, operations
- [`docs/environment.md`](docs/environment.md): environment variable reference for all services, security notes

## Future work

- Tune Render Workflows concurrency, timeouts, and plans per repo or workflow
- Enhanced spec-driven development with approval gates and inline spec editing
- External integrations (Slack notifications, webhook triggers)
- Per-team usage dashboards and LLM cost attribution
- VM-level sandbox isolation for untrusted workloads

## License

Open source. See [LICENSE](./LICENSE) for details.
