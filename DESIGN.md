# render-open-forge

## Vision

A fully open-source, self-hosted **agentic forge** — a code hosting and CI platform with AI-powered development built in.

The platform ships its own forge (Forgejo) and CI runners (Forgejo Actions on Render), removing all external dependencies from the critical path. GitHub, GitLab, and other external forges are optional sync targets for import/export — never required infrastructure.

**Core thesis:** Code hosting and CI are first-class primitives owned by the platform. Agentic development is a feature layer on top.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  render-open-forge                                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Next.js    │  │    Agent     │  │       Forgejo         │ │
│  │   (Web UI)   │  │   (Worker)   │  │   (Code Host + CI)    │ │
│  │              │  │              │  │                       │ │
│  │  - Chat      │  │  - AI loop   │  │  - Git repos          │ │
│  │  - Sessions  │  │  - Tools     │  │  - Pull requests      │ │
│  │  - Repo UI   │  │  - Sandbox   │  │  - Actions (CI)       │ │
│  │  - PR review │  │  - Jobs      │  │  - OAuth provider     │ │
│  │  - Settings  │  │              │  │  - Webhooks           │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                  │                      │             │
│         └──────────────────┴──────────────────────┘             │
│                    Internal network                              │
│                            │                                    │
│  ┌─────────────┐  ┌───────┴───────┐  ┌───────────────────────┐ │
│  │  Postgres   │  │    Redis      │  │  Forgejo Runner       │ │
│  │  (shared)   │  │  (jobs/cache) │  │  (CI execution)       │ │
│  └─────────────┘  └───────────────┘  └───────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Optional sync layer
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           GitHub          GitLab         Bitbucket
         (import/          (import/       (import/
          export)           export)        export)
```

---

## Components

### 1. Forgejo (Internal Forge)

**Role:** Source of truth for all code, pull requests, CI pipelines, and user identity.

**Deployment:** Docker container on Render with persistent disk for git storage.

**Responsibilities:**
- Git repository hosting (all repos live here)
- Pull request / code review workflows
- CI via Forgejo Actions (GitHub Actions YAML-compatible)
- OAuth2/OIDC provider (authenticates the Next.js app)
- User authentication (Google OAuth, extensible to other providers)
- Webhook emission (PR events, CI status → triggers agent runs)
- API for all repo/branch/PR operations

**Configuration:**
- Google OAuth as external authentication source (users sign in with Google)
- Disable local registration (all auth via external providers)
- Agent service account (created at deploy time, scoped repo access)
- Internal networking (private service on Render, not publicly exposed except for auth flows)

**Key decisions:**
- Single Forgejo instance, namespace isolation (Option 3C)
- Each user gets a personal namespace; orgs for shared repos
- Forgejo UI is NOT user-facing (headless — API only); we build our own UI

---

### 2. Next.js Web App (Custom UI)

**Role:** The user-facing application. All user interaction happens here.

**What we build (not Forgejo's UI):**
- Repository browser (file tree, file viewer, blame, history)
- Pull request interface (diff view, line comments, approve/request changes)
- Code review with AI-assisted suggestions
- Agent chat / session interface
- Session management (create, configure, monitor)
- Settings (connected accounts for sync, preferences)
- CI pipeline status and logs
- Repo creation / import flow

**Authentication:**
- Registers as an OAuth2 application in Forgejo
- Users click "Sign in with Google" → Forgejo handles OAuth → redirects back with token
- App stores Forgejo OAuth token in session for API calls
- No separate user database — Forgejo is the identity source of truth

**API pattern:**
- All repo/git operations → Forgejo REST API
- Agent/session/chat operations → own Postgres tables + Redis
- CI status → Forgejo API (actions endpoints)

---

### 3. Agent Worker

**Role:** AI-powered development agent that operates on Forgejo repos.

**Carried over from `render-open-agents`:**
- Agent execution loop (`runAgentTurn` / `generateText`)
- Tool system architecture (tool registry, `experimental_context`)
- Tools: `bash`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `web_fetch`, `task`, `todo_write`, `ask_user_question`
- Sandbox system (isolated execution environments)
- Redis job queue consumption
- Chat message streaming
- Subagent spawning

**Rewritten:**
- `git.ts` → pushes to internal Forgejo (service account token, no OAuth dance)
- `create-pull-request.ts` → creates PR on Forgejo via API
- Context: `RenderAgentContext` → `ForgeAgentContext` with `forgejoToken`, `repoPath`, `baseBranch`
- No GitHub token resolution — agent always has a valid Forgejo service token

**New tools:**
- `create_pull_request` (Forgejo-native)
- `run_ci` (trigger Forgejo Actions workflow)
- `check_ci_status` (poll/read CI results)

---

### 4. Forgejo Actions Runner

**Role:** Executes CI pipelines defined in `.forgejo/workflows/` YAML files.

**Deployment:** Separate Docker container on Render (must not run on same machine as Forgejo for security).

**Configuration:**
- Registered with the Forgejo instance via admin token
- Docker-in-Docker for isolated job execution
- Labels for job routing

---

### 5. Sync Layer (Optional External Forge Connections)

**Role:** Import repos from and export results to external forges.

**Interface:**

```typescript
interface SyncProvider {
  id: string; // 'github' | 'gitlab' | 'bitbucket'

  // Auth
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;

  // Import
  listRemoteRepos(token: string): Promise<RemoteRepo[]>;
  importRepo(token: string, remote: RemoteRepo, localPath: string): Promise<ImportResult>;

  // Mirror
  setupMirror(opts: MirrorOpts): Promise<Mirror>;
  syncMirror(mirror: Mirror): Promise<SyncResult>;

  // Export
  pushBranch(token: string, localRepo: string, branch: string, remote: RemoteRepo): Promise<void>;
  createUpstreamReview(token: string, opts: ReviewOpts): Promise<{ url: string; id: number }>;

  // Incoming webhooks
  verifyWebhook(headers: Headers, body: Buffer, secret: string): boolean;
  parseWebhook(headers: Headers, body: unknown): SyncEvent | null;
}
```

**Implementations (phased):**
- Phase 1: GitHub SyncProvider
- Phase 2: GitLab SyncProvider
- Future: Bitbucket, Gitea/Forgejo federation

---

## Data Model

### Forgejo-owned (we don't duplicate):
- Users / identity
- Repositories (git objects, metadata)
- Pull requests, reviews, comments
- CI workflow runs and logs
- OAuth applications and tokens

### Platform-owned (our Postgres):

```sql
-- Agent sessions (a workspace: user + repo + branch + agent)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Forgejo user ID
  forgejo_repo_path TEXT NOT NULL, -- e.g. "alice/my-project"
  branch TEXT NOT NULL,            -- agent's working branch
  base_branch TEXT NOT NULL,       -- target for PR (e.g. "main")
  title TEXT,
  status TEXT DEFAULT 'idle',      -- idle | running | paused | complete | failed
  pr_number INTEGER,              -- Forgejo PR number (once created)
  pr_status TEXT,                 -- open | merged | closed

  -- Sync info (if imported from external forge)
  upstream_provider TEXT,          -- 'github' | 'gitlab' | null
  upstream_repo_url TEXT,
  upstream_pr_url TEXT,

  -- Agent config
  workflow_mode TEXT DEFAULT 'auto',
  max_ci_fix_attempts INTEGER DEFAULT 3,
  ci_fix_attempts INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages within sessions
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  role TEXT NOT NULL,             -- user | assistant | system
  content TEXT,
  model_messages JSONB,          -- full AI SDK message array
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent runs (individual turn executions)
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  status TEXT DEFAULT 'pending',
  trigger TEXT,                   -- 'user_message' | 'ci_failure' | 'review_comment'
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT
);

-- CI events (from Forgejo Actions webhooks)
CREATE TABLE ci_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  run_id TEXT,
  status TEXT,                   -- success | failure | pending | running
  workflow_name TEXT,
  logs_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sync connections (user's linked external accounts)
CREATE TABLE sync_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,         -- 'github' | 'gitlab'
  access_token TEXT NOT NULL,     -- encrypted
  refresh_token TEXT,             -- encrypted
  expires_at TIMESTAMP,
  remote_username TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Active mirrors
CREATE TABLE mirrors (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  sync_connection_id TEXT NOT NULL REFERENCES sync_connections(id),
  forgejo_repo_path TEXT NOT NULL,
  remote_repo_url TEXT NOT NULL,
  direction TEXT NOT NULL,        -- 'pull' | 'push' | 'bidirectional'
  last_sync_at TIMESTAMP,
  status TEXT DEFAULT 'active'
);
```

---

## Authentication Flow

```
User visits app
       │
       ▼
Next.js app redirects to Forgejo OAuth authorize endpoint
       │
       ▼
Forgejo shows "Sign in with Google" (external auth source)
       │
       ▼
Google OAuth dance (handled by Forgejo)
       │
       ▼
Forgejo creates/finds user, issues OAuth token
       │
       ▼
Redirect back to Next.js with authorization code
       │
       ▼
Next.js exchanges code for Forgejo access token
       │
       ▼
User is authenticated. Token stored in session cookie.
All Forgejo API calls use this token.
```

**Agent authentication:**
- Dedicated service account created at deploy time via Forgejo admin API
- Service account has a long-lived API token with write access to user repos
- Agent worker uses this token for all git/PR operations
- User grants agent access to specific repos (Forgejo collaborator model)

---

## Repo Structure

```
render-open-forge/
├── apps/
│   └── web/                          # Next.js application
│       ├── app/
│       │   ├── api/
│       │   │   ├── auth/             # OAuth callback + session management
│       │   │   ├── sessions/         # Agent session CRUD
│       │   │   ├── sync/             # Import/export/mirror endpoints
│       │   │   └── webhooks/
│       │   │       └── forgejo/      # Internal Forgejo webhook handler
│       │   ├── (app)/
│       │   │   ├── repos/            # Repo browser, file viewer
│       │   │   ├── [owner]/[repo]/
│       │   │   │   ├── pulls/        # PR list + detail + review
│       │   │   │   ├── actions/      # CI runs
│       │   │   │   └── settings/     # Repo settings
│       │   │   ├── sessions/         # Agent sessions
│       │   │   ├── settings/         # User settings, sync connections
│       │   │   └── new/              # New repo / import flow
│       │   └── layout.tsx
│       ├── components/
│       │   ├── code/                 # File viewer, syntax highlighting
│       │   ├── diff/                 # Diff viewer, line comments
│       │   ├── chat/                 # Agent chat interface
│       │   ├── ci/                   # Pipeline status, logs
│       │   └── repo/                 # Repo browser, branch selector
│       ├── lib/
│       │   ├── forgejo/              # Forgejo API client
│       │   ├── auth/                 # Session management, token handling
│       │   ├── sync/                 # Sync provider implementations
│       │   │   ├── types.ts          # SyncProvider interface
│       │   │   ├── github.ts
│       │   │   └── gitlab.ts
│       │   └── db/
│       │       ├── schema.ts         # Re-exports from @render-open-forge/db
│       │       └── migrations/
│       └── drizzle.config.ts
│
├── packages/
│   ├── agent/                        # Agent worker (from render-open-agents)
│   │   ├── src/
│   │   │   ├── agent.ts             # Core agent loop
│   │   │   ├── worker.ts            # Redis job consumer
│   │   │   ├── tools/
│   │   │   │   ├── index.ts
│   │   │   │   ├── bash.ts
│   │   │   │   ├── read-file.ts
│   │   │   │   ├── write-file.ts
│   │   │   │   ├── edit-file.ts
│   │   │   │   ├── glob.ts
│   │   │   │   ├── grep.ts
│   │   │   │   ├── git.ts           # REWRITTEN: targets Forgejo
│   │   │   │   ├── create-pr.ts     # REWRITTEN: creates Forgejo PR
│   │   │   │   ├── run-ci.ts        # NEW: trigger Actions workflow
│   │   │   │   ├── check-ci.ts      # NEW: read CI status
│   │   │   │   ├── web-fetch.ts
│   │   │   │   ├── task.ts
│   │   │   │   ├── todo-write.ts
│   │   │   │   └── ask-user.ts
│   │   │   ├── context/
│   │   │   │   └── agent-context.ts  # ForgeAgentContext
│   │   │   └── run/
│   │   │       └── forge-auth.ts     # Service account token (trivial)
│   │   └── package.json
│   │
│   ├── db/                           # Drizzle schema (shared)
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   └── package.json
│   │
│   ├── sandbox/                      # Sandbox adapters (from render-open-agents)
│   │   └── ...
│   │
│   └── shared/                       # Shared utilities
│       ├── lib/
│       │   ├── job-queue.ts          # Redis job queue
│       │   ├── streaming.ts          # SSE/streaming helpers
│       │   └── errors.ts
│       ├── index.ts
│       └── package.json
│
├── infrastructure/
│   ├── forgejo/
│   │   ├── Dockerfile                # Custom Forgejo image (themed)
│   │   ├── app.ini                   # Forgejo configuration
│   │   └── setup.sh                  # First-run provisioning script
│   └── runner/
│       ├── Dockerfile                # Forgejo Actions runner
│       └── config.yml
│
├── render.yaml                       # Render Blueprint
├── docker-compose.yml                # Local development
├── turbo.json
├── package.json
└── README.md
```

---

## Render Blueprint (`render.yaml`)

```yaml
services:
  # --- Web Application ---
  - type: web
    name: forge-web
    runtime: node
    plan: starter
    buildCommand: npm install && npx turbo build --filter=web
    startCommand: npm run start --workspace=apps/web
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: forge-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: forge-redis
          type: keyvalue
          property: connectionString
      - key: FORGEJO_INTERNAL_URL
        value: http://forge-forgejo:3000
      - key: FORGEJO_EXTERNAL_URL
        sync: false  # set manually to public URL
      - key: FORGEJO_OAUTH_CLIENT_ID
        sync: false
      - key: FORGEJO_OAUTH_CLIENT_SECRET
        sync: false
      - key: FORGEJO_AGENT_TOKEN
        sync: false  # service account token
      - key: SESSION_SECRET
        generateValue: true
      - key: ANTHROPIC_API_KEY
        sync: false

  # --- Agent Worker ---
  - type: worker
    name: forge-agent
    runtime: node
    plan: starter
    buildCommand: npm install && npx turbo build --filter=agent
    startCommand: npm run start --workspace=packages/agent
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: forge-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: forge-redis
          type: keyvalue
          property: connectionString
      - key: FORGEJO_INTERNAL_URL
        value: http://forge-forgejo:3000
      - key: FORGEJO_AGENT_TOKEN
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: SANDBOX_SERVICE_HOST
        sync: false

  # --- Forgejo (Code Host + Auth) ---
  - type: web
    name: forge-forgejo
    runtime: docker
    plan: standard
    dockerfilePath: infrastructure/forgejo/Dockerfile
    healthCheckPath: /api/v1/version
    disk:
      name: forgejo-data
      mountPath: /data
      sizeGB: 10
    envVars:
      - key: FORGEJO__database__DB_TYPE
        value: postgres
      - key: FORGEJO__database__HOST
        fromDatabase:
          name: forge-db
          property: host
      - key: FORGEJO__database__NAME
        fromDatabase:
          name: forge-db
          property: database
      - key: FORGEJO__database__USER
        fromDatabase:
          name: forge-db
          property: user
      - key: FORGEJO__database__PASSWD
        fromDatabase:
          name: forge-db
          property: password
      - key: FORGEJO__server__ROOT_URL
        sync: false  # public Forgejo URL
      - key: FORGEJO__oauth2__JWT_SECRET
        generateValue: true
      - key: GOOGLE_OAUTH_CLIENT_ID
        sync: false
      - key: GOOGLE_OAUTH_CLIENT_SECRET
        sync: false

  # --- Forgejo Actions Runner ---
  - type: worker
    name: forge-runner
    runtime: docker
    plan: starter
    dockerfilePath: infrastructure/runner/Dockerfile
    envVars:
      - key: FORGEJO_URL
        value: http://forge-forgejo:3000
      - key: RUNNER_TOKEN
        sync: false  # registration token from Forgejo admin

  # --- Redis ---
  - type: keyvalue
    name: forge-redis
    plan: starter
    ipAllowList: []  # internal only
    maxmemoryPolicy: allkeys-lru

databases:
  - name: forge-db
    plan: basic-256mb
    postgresMajorVersion: 16

previews:
  generation: manual
```

---

## What Comes Over from `render-open-agents`

### Direct copy (minimal changes):

| Source | Destination | Changes |
|--------|-------------|---------|
| `packages/agent/src/agent.ts` | `packages/agent/src/agent.ts` | Rename context type |
| `packages/agent/src/worker.ts` | `packages/agent/src/worker.ts` | Remove GitHub auth resolution |
| `packages/agent/src/tools/bash.ts` | Same | None |
| `packages/agent/src/tools/read-file.ts` | Same | None |
| `packages/agent/src/tools/write-file.ts` | Same | None |
| `packages/agent/src/tools/edit-file.ts` | Same | None |
| `packages/agent/src/tools/glob.ts` | Same | None |
| `packages/agent/src/tools/grep.ts` | Same | None |
| `packages/agent/src/tools/web-fetch.ts` | Same | None |
| `packages/agent/src/tools/task.ts` | Same | Update context propagation |
| `packages/agent/src/tools/todo-write.ts` | Same | None |
| `packages/agent/src/tools/ask-user.ts` | Same | None |
| `packages/sandbox/` | `packages/sandbox/` | None |
| `packages/shared/lib/agent-job-queue.ts` | `packages/shared/lib/job-queue.ts` | Rename, same logic |
| `packages/shared/lib/streaming/` | `packages/shared/lib/streaming.ts` | Same |
| `apps/web/components/` (chat UI) | `apps/web/components/chat/` | Adapt styling |

### Rewritten (same concept, different implementation):

| Concept | Old (`render-open-agents`) | New (`render-open-forge`) |
|---------|---------------------------|--------------------------|
| Git push/pull auth | `x-access-token:${githubToken}@github.com` | `http://agent:${serviceToken}@forgejo:3000` |
| Create PR | `GitHubClient.createPullRequest()` | `ForgejoClient.createPullRequest()` |
| Token resolution | `resolveUserGitHubToken()` → decrypt from accounts | `getAgentToken()` → env var, always available |
| Webhook handler | Parse GitHub `check_run` events | Parse Forgejo Actions webhook events |
| Clone URL validation | `isAllowedHttpsGitHubCloneUrl()` | Not needed — always internal |
| Repo listing | GitHub REST API → Octokit | Forgejo REST API |
| Session creation | Creates session + clones from GitHub | Creates session + creates/forks Forgejo repo |
| CI trigger | Wait for GitHub webhook | Trigger Forgejo Actions directly or wait for webhook |

### Dropped entirely:

| Component | Why |
|-----------|-----|
| `packages/shared/lib/github/` | No GitHub in critical path |
| `apps/web/app/api/github/` | Replaced by Forgejo API calls + sync routes |
| `apps/web/lib/auth/config.ts` (Better Auth) | Forgejo handles auth |
| `apps/web/lib/github-clone-url.ts` | Internal clones only |
| GitHub App configuration (`GITHUB_APP_ID`, etc.) | Not applicable |
| `accounts` / `auth_sessions` tables | Forgejo-owned |

### New (doesn't exist in `render-open-agents`):

| Component | Purpose |
|-----------|---------|
| `apps/web/lib/forgejo/client.ts` | Typed Forgejo REST API client |
| `apps/web/components/code/` | File browser, syntax highlighting |
| `apps/web/components/diff/` | Diff viewer with line comments |
| `apps/web/components/ci/` | Pipeline status, log viewer |
| `apps/web/components/repo/` | Repo browser, branch picker |
| `apps/web/lib/sync/` | SyncProvider interface + implementations |
| `apps/web/app/api/webhooks/forgejo/` | Internal webhook handler |
| `infrastructure/forgejo/` | Forgejo Docker + config |
| `infrastructure/runner/` | Actions runner Docker + config |
| `packages/agent/src/tools/run-ci.ts` | Trigger CI from agent |
| `packages/agent/src/tools/check-ci.ts` | Read CI results from agent |

---

## Implementation Phases

### Phase 0: Scaffolding (Week 1)

**Goal:** Monorepo boots, Forgejo runs, basic auth works.

- [ ] Initialize repo (Turborepo + Bun)
- [ ] Set up `packages/db` with Drizzle schema
- [ ] Set up `apps/web` (Next.js 15, Tailwind, shadcn/ui)
- [ ] Create `infrastructure/forgejo/Dockerfile` + `app.ini`
- [ ] Create `docker-compose.yml` for local dev (Forgejo + Postgres + Redis)
- [ ] Configure Forgejo with Google OAuth as auth source
- [ ] Register Next.js app as OAuth2 client in Forgejo
- [ ] Implement OAuth flow: login → Forgejo → Google → back to app
- [ ] Basic authenticated shell (logged in user sees dashboard)
- [ ] Forgejo agent service account provisioning script

### Phase 1: Forge UI — Repos & Files (Week 2)

**Goal:** Users can create repos, browse code, view files.

- [ ] `apps/web/lib/forgejo/client.ts` — typed API client
- [ ] Repo creation flow (form → Forgejo API → repo ready)
- [ ] Repo list page (user's repos + orgs)
- [ ] File browser (tree view, file content with syntax highlighting)
- [ ] Branch selector
- [ ] Commit history view
- [ ] Basic repo settings page

### Phase 2: Agent Integration (Week 3)

**Goal:** Agent can work on Forgejo repos, push code, open PRs.

- [ ] Copy agent package from `render-open-agents`
- [ ] Rewrite `git.ts` to target internal Forgejo
- [ ] Rewrite `create-pr.ts` for Forgejo API
- [ ] Implement `ForgeAgentContext` (service token, repo path)
- [ ] Session creation → creates branch on Forgejo repo
- [ ] Agent worker: consume jobs from Redis, execute turns
- [ ] Chat UI (carried from render-open-agents, adapted)
- [ ] Agent can: clone, edit, commit, push, open PR — all on Forgejo

### Phase 3: Pull Requests & Code Review (Week 4)

**Goal:** Full PR workflow with AI-assisted review.

- [ ] PR list view (open, closed, merged)
- [ ] PR detail: description, commits, status
- [ ] Diff viewer with syntax highlighting
- [ ] Line-by-line comment UI
- [ ] Approve / Request Changes actions
- [ ] Merge button (merge, squash, rebase)
- [ ] AI review suggestions (agent reads diff, posts comments)
- [ ] Forgejo webhook: PR events → update session state

### Phase 4: CI Integration (Week 5)

**Goal:** Forgejo Actions runs pipelines, agent reacts to failures.

- [ ] Set up Forgejo Actions runner (Docker container)
- [ ] `.forgejo/workflows/` support in repos
- [ ] CI status display on PRs
- [ ] Pipeline log viewer
- [ ] Webhook: CI failure → enqueue agent fix job
- [ ] Agent tools: `run_ci`, `check_ci_status`
- [ ] Auto-fix loop: CI fails → agent fixes → pushes → CI re-runs

### Phase 5: Sync Layer (Week 6)

**Goal:** Import repos from GitHub/GitLab, push results upstream.

- [ ] `SyncProvider` interface
- [ ] GitHub implementation (OAuth + import + push + upstream PR)
- [ ] "Connect GitHub" settings page
- [ ] Import flow: pick GitHub repo → mirror into Forgejo
- [ ] Export flow: push branch + create PR on GitHub
- [ ] GitLab implementation (same pattern)
- [ ] Webhook ingestion from external forges (upstream changes → re-sync)

### Phase 6: Render Deploy (Week 6, parallel)

**Goal:** One-click deploy to Render via Blueprint.

- [ ] Finalize `render.yaml`
- [ ] Forgejo first-run setup automation (admin user, OAuth source, agent account)
- [ ] Health checks for all services
- [ ] Environment variable documentation
- [ ] Deploy guide in README
- [ ] Preview environments for PRs

---

## Local Development

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: forge
      POSTGRES_USER: forge
      POSTGRES_PASSWORD: forge
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  forgejo:
    image: codeberg.org/forgejo/forgejo:14
    environment:
      - FORGEJO__database__DB_TYPE=postgres
      - FORGEJO__database__HOST=postgres:5432
      - FORGEJO__database__NAME=forge
      - FORGEJO__database__USER=forge
      - FORGEJO__database__PASSWD=forge
      - FORGEJO__server__ROOT_URL=http://localhost:3000
      - FORGEJO__server__HTTP_PORT=3000
      - FORGEJO__service__DISABLE_REGISTRATION=false
      - FORGEJO__actions__ENABLED=true
    ports:
      - "3000:3000"
    volumes:
      - forgejo-data:/data
    depends_on:
      - postgres

  runner:
    image: code.forgejo.org/forgejo/runner:6.0.0
    environment:
      - FORGEJO_URL=http://forgejo:3000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - forgejo

volumes:
  pgdata:
  forgejo-data:
```

**Dev workflow:**
1. `docker compose up` (Forgejo + Postgres + Redis + Runner)
2. Run setup script (creates admin, configures Google OAuth, creates agent account)
3. `bun dev` in monorepo root (starts Next.js + agent worker)

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Forge | Forgejo (not Gitea, not GitLab) | MIT license, community-governed, lightweight, Actions-compatible |
| UI | Custom Next.js (not Forgejo's UI) | AI-native UX, full control, modern React stack |
| Identity | Forgejo as OAuth provider + Google auth source | Single identity store, no sync, standard OIDC |
| Multi-tenancy | Single instance, namespace isolation | Simple ops, Forgejo handles permissions natively |
| CI | Forgejo Actions | GitHub Actions YAML-compatible, integrated with forge |
| Agent sandbox | Carried from render-open-agents | Proven, isolated execution |
| Job queue | Redis Streams | Carried from render-open-agents, reliable |
| Database | Shared Postgres (Forgejo tables + app tables) | Single instance, cost-efficient on Render |
| External forges | Optional SyncProviders | Import/export only, never on critical path |
| Deployment | Render Blueprint | One-click deploy, auto-redeploy on push |

---

## Open Questions (to resolve during implementation)

1. **Shared Postgres vs separate?** — Forgejo can use the same Postgres instance. Simpler but couples their migrations. Separate is safer but costs more on Render.

2. **Forgejo public exposure** — Does Forgejo need a public URL (for `git clone` from user's machine)? Or is it purely internal (all git ops happen via the web app / agent)?

3. **Agent repo access model** — Does the agent service account get blanket write access, or per-repo collaborator grants? (Per-repo is safer, blanket is simpler for v1.)

4. **Real-time updates** — SSE from Next.js for chat streaming (carried from render-open-agents). For repo/PR updates, poll Forgejo API or add WebSocket layer?

5. **File storage for large repos** — Forgejo persistent disk on Render. What's the growth/cost model? Should we add LFS support from the start?

6. **Runner scaling** — Single runner is fine for v1. How do we scale CI execution as usage grows? Render auto-scaling? Multiple runner containers?
