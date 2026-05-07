# render-open-forge — Remaining Work

## Design Principle

Every forge operation (repo management, PRs, CI, code review, merging) must be exposed as both:
1. **A UI action** — for human users interacting through the web interface
2. **A tool/trigger** — for agents operating in chat or reacting to events

This means the service layer is the source of truth — the UI and agent tools are both thin consumers of the same underlying API. When building a new capability, always implement it as a **service function first**, then expose it to the UI (via API route) and to agents (via tool definition + event trigger).

Example: "Merge a PR" is a service function that calls Forgejo's API. The UI calls it via `POST /api/repos/:owner/:repo/pulls/:number/merge`. An agent calls it via the `merge_pr` tool. A trigger fires it automatically when CI passes and the spec is approved.

---

## 1. Forgejo Deep Integration (Critical Path)

### 1.1 Webhook Handler
- [x] `/api/webhooks/forgejo` — `push` (branch sessions + stats), `workflow_run.completed` (+ `ci_failure` enqueue), `pull_request` (+ optional `pr_opened`/`pr_merged`), `issue_comment` / `pull_request_review_comment` → `review_comment`, `status` rows in `ci_events`
- [x] HMAC verification (`FORGEJO_WEBHOOK_SECRET` or `FORGEJO_WEBHOOK_ALLOW_UNSIGNED=true` for explicit dev waiver)
- [x] Dispatcher → Redis jobs via `enqueueSessionTriggerJob`

### 1.2 Repo Lifecycle
- [x] Service helpers (`packages/shared/lib/forgejo/repo-service.ts`) wrapping `ForgejoClient`
- [x] Dedicated REST façade routes (branch protections, PR merge/close PATCH; fuller repo façade still expandable)
- [x] Agent tool `create_repo`
- [x] Repo creation UI (`/repos/new`)

### 1.3 Pull Request Workflow
- [x] `ForgejoClient` PR/issue/review/helpers + merge/close/comments
- [x] Agent tools `merge_pr`, `close_pr`, `add_pr_comment`, `request_review`, `approve_pr`
- [x] PR detail + diff panel (inline threads deferred)
- [x] Trigger: "on PR opened" → spin up review agent; "on CI green + `project_config.autoMerge`/`auto_merge`" → auto-merge (Forgejo enforcement for approvals still applies)

### 1.4 Branch Protection
- [x] Service layer: `setBranchProtection`, `getBranchProtection`, `normalizeBranchProtectionList`, `forgeListBranchProtections` (`repo-service.ts`)
- [x] UI: branch protection toggle for default branch in repo settings
- [x] Enforce in-app UX: merge controls show branch-protection warning banner, error messages parsed for permission/CI/approval blocks

### 1.5 Code Review
- [x] Service layer: `listPRComments`, `addInlineComment`, `resolveComment`, `submitReview` wrappers (`review-service.ts`) + ForgejoClient extensions (`listPullReviews`, `listPullReviewComments`, `resolveReviewComment`, etc.)
- [x] Agent tools: `review_pr` (COMMENT review + optional inline notes), `pull_request_diff`
- [x] Agent tools: `resolve_comment` (resolve/unresolve by comment ID)
- [x] UI: PR detail page shows inline + general comments with resolve/unresolve toggles and comment form (`PRComments` component); API routes for comments + reviews + resolve
- [x] Trigger: "on review comment" → `review_comment` webhook trigger already enqueues agent job with comment context

---

## 2. CI/CD Pipeline

### 2.1 Forgejo Actions Runner
- [x] Runner registration script (`scripts/register-runner.sh`) — obtains token via admin API
- [x] Workflow file templates (`ci-helpers.ts`: Node, Python, Go, Rust)
- [x] Job execution in Docker-in-Docker (docker-compose wired: runner + dind services)
- [x] Status reporting: `ForgejoClient.createCommitStatus` + `getCombinedStatus` + `ci-helpers.ts` service wrappers

### 2.2 Build Log Streaming
- [x] Service layer: SSE endpoint `GET /api/repos/.../actions/runs/.../logs/stream` polls Forgejo and streams log chunks
- [x] UI: actions detail page polls plaintext job logs when opened with `?job=FORGEJO_JOB_ID` (via `/api/repos/.../jobs/.../logs`)
- [x] Agent access: `read_build_log` tool fetches plaintext logs with truncation
- [x] Plaintext Forgejo logs: `ForgejoClient.getActionJobLogs`, `/api/repos/.../jobs/.../logs`, agent `read_build_log`

### 2.3 Artifacts & Test Results
- [x] Artifact API: `ForgejoClient.listActionArtifacts`, `downloadArtifact`; API routes `GET /api/repos/.../actions/runs/.../artifacts`, `GET /api/repos/.../actions/artifacts/:id` (download proxied via server)
- [x] Test result parsing: `parseJUnitXML`, `parseTAPOutput` in `packages/shared/lib/ci/test-results.ts`
- [x] UI: `TestResultsPanel` component with expandable pass/fail/skip counts
- [x] API: `GET /api/repos/.../actions/runs/.../test-results` returns parsed results

### 2.4 Secrets & Environment
- [x] `ForgejoClient` helpers: `setRepoSecret`, `deleteRepoSecret`, `listRepoSecrets`
- [x] Org-level secrets: `ForgejoClient.setOrgSecret`, `listOrgSecrets`, `deleteOrgSecret`; API routes `GET|POST /api/orgs/:org/secrets`, `DELETE /api/orgs/:org/secrets/:name`
- [x] UI: `SecretsSettings` component in repo settings — list/add/delete secrets (masked values)
- [x] API routes: `GET /api/repos/.../secrets`, `PUT|DELETE /api/repos/.../secrets/:name`
- [x] Inject secrets into runner environment at job time (handled natively by Forgejo runner — repo/org secrets are auto-injected into workflow env)

### 2.5 Agent-Triggered CI
- [x] Forgejo triggers CI on pushes; webhook `workflow_run.failure` queues fix attempts with `sessions.ci_*` safeguards
- [x] Escalation utility: `shouldEscalate` / `createEscalationNotification` in `apps/web/lib/agent/escalation.ts`

---

## 3. External Forge Sync

### 3.1 GitHub OAuth
- [x] OAuth authorize + `/api/oauth/github/callback`, tokens in `sync_connections`
- [x] Token refresh: `refreshGitHubToken`, `getValidGitHubToken`, `listGitHubRepos` in `apps/web/lib/sync/github.ts`

### 3.2 GitLab OAuth
- [x] Full OAuth flow: `/api/oauth/gitlab` redirects to GitLab authorize, `/api/oauth/gitlab/callback` exchanges code + upserts `sync_connections`
- [x] Token refresh: `refreshGitLabToken`, `listGitLabRepos` in `apps/web/lib/sync/gitlab.ts`

### 3.3 Mirror/Sync Engine
- [x] Service layer: `createMirror`, `syncMirror`, `deleteMirror`, `listMirrors` in `apps/web/lib/sync/mirror-engine.ts`
- [x] Push mirror: local Forgejo → external via Forgejo mirror-sync API
- [x] Pull mirror: configured via `ForgejoClient.updateRepo` with `mirror: true`
- [x] Conflict resolution: `resolveMirrorConflict(db, mirrorId, strategy)` supports `force-push | manual | rebase`; API route `POST /api/mirrors/:id/resolve`
- [x] Cron sync scheduler: `startMirrorCron(db, intervalMs)` / `stopMirrorCron()` — periodic sync of all active mirrors, respects `lastSyncAt` per mirror
- [x] API routes: `GET|POST /api/mirrors`, `DELETE /api/mirrors/:id`, `POST /api/mirrors/:id/sync`

### 3.4 Import Wizard
- [x] UI: multi-select repos from connected GitHub/GitLab account (`/repos/import` page)
- [x] Bulk import via Forgejo migrate API (`ForgejoClient.migrateRepo`)
- [x] API: `GET /api/sync/:provider/repos`, `POST /api/repos/import`
- [x] Preserves branches, tags, default branch via Forgejo migration

### 3.5 Webhook Forwarding
- [x] GitHub ingestion: `POST /api/webhooks/github` logs `x-github-event`, dispatches review_comment triggers for mirrored repos
- [x] Forward PR comment events into agent job queue via `enqueueSessionTriggerJob`

---

## 4. Agent Capabilities (Agentic Loop)

### 4.1 Ask-User Reply Mechanism
- [x] `POST /api/sessions/:id/reply` RPUSH semantics + session ownership checks
- [x] Worker BLPOP (existing `ask_user_question` implementation)
- [x] Chat panel posts replies with `toolCallId` / `runId`

### 4.2 Spec Workflow
- [x] `submit_spec` tool persists rows + SSE `spec` event
- [x] `POST /api/sessions/:id/spec` approve → enqueue execute; reject → enqueue spec revise
- [x] `POST /api/sessions/:id/phase` (skip-phase UI support)
- [x] `PATCH /api/sessions/:id/config` merges `projectConfig`/`projectConfigPatch` into `project_config`

### 4.3 Verification Loop
- [x] `verify` phase + `project_config.verifyChecks` runs sandbox verifier, emits `verification` / `verify_failed`, enqueues legacy `enqueueFixRun` on failures
- [x] Automated phase hopping: `phase-transitions.ts` with `nextPhase`, `shouldAutoTransition`, `AUTO_TRANSITIONS` constants

### 4.4 Deliver Phase
- [x] Agent can push/create PR (`create_pull_request` / git tools — session-dependent)
- [x] Deliver completion: `isDeliverComplete`, `transitionToComplete` in `packages/agent/src/lib/deliver.ts`
- [x] Auto-merge webhook path when `project_config.autoMerge|auto_merge` (Forgejo merges; session row updates via `pull_request.closed` webhook)
- [x] Transition to `complete` via deliver helpers + PR merge webhook

### 4.5 Reactive Triggers
- [x] `ci_failure` / `review_comment` / PR opened / merged enqueue agent jobs (`schedule` cron still TODO)

### 4.6 Multi-Agent Coordination
- [x] Agent roles + pipeline types: `AgentRole`, `AgentPipeline`, `AgentPipelineStep` in `packages/agent/src/lib/multi-agent.ts`
- [x] Default pipeline: spec → implement → review → merge
- [x] `getToolsForRole`, `nextPipelineStep` utilities
- [x] Runtime orchestration: `handoffToNextAgent(db, redis, params)` creates new run, updates session phase, enqueues job for next pipeline role; integrated into `handleAutoPhaseTransition`; `findRoleForTrigger`, `isAutoStep`, `roleToPhase` utilities

### 4.7 Agent Configuration
- [x] Per-repo `.forge/agents.yml` config: `AgentConfigSchema` (Zod), `loadAgentConfig`, `mergeWithDefaults` in `packages/agent/src/lib/agent-config.ts`
- [x] API: `GET|POST /api/repos/.../agent-config` reads/writes `.forge/agents.json` via Forgejo file content API
- [x] UI: `PipelineEditor` component in repo settings — visual step list with add/edit/delete controls, auto-merge toggle, verify checks list; reads/writes `.forge/agents.json` via agent-config API

---

## 5. Multi-Tenancy & Organizations

### 5.1 Organization Management
- [x] Service layer: `createOrg`, `deleteOrg`, `listOrgMembers`, `addOrgMember`, `removeOrgMember`, `listUserOrgs` in `apps/web/lib/orgs/org-service.ts`
- [x] ForgejoClient: `createOrg`, `deleteOrg`, `listOrgMembers`, `addOrgMember`, `removeOrgMember`, `listUserOrgs`
- [x] API routes: `GET|POST /api/orgs`, `DELETE /api/orgs/:org`, `GET|PUT|DELETE /api/orgs/:org/members`
- [x] UI: organizations listing page (`/orgs`) with create-org form

### 5.2 Teams & Roles
- [x] Role definitions: `OrgRole` = owner | admin | developer | viewer
- [x] Permission map + checks: `hasPermission`, `checkPermission` in `apps/web/lib/orgs/permissions.ts`
- [x] UI: team management page at `/orgs/:org/members` — list members with avatars, add/remove controls, uses org members API

### 5.3 Resource Quotas
- [x] Quota types + defaults: `OrgQuota`, `DEFAULT_QUOTA`, `UsageSummary` in `apps/web/lib/orgs/quotas.ts`
- [x] Enforcement utilities: `isWithinQuota`, `getQuotaUsagePercent`
- [x] UI: usage dashboard at `/orgs/:org/usage` — quota bars for tokens, sandbox minutes, sessions, storage with color-coded thresholds; API route `GET /api/orgs/:org/usage` aggregates from `usageEvents` + `sessions`

---

## 6. Production Hardening

### 6.1 Database
- [x] Migration utility: `runMigrations`, `getMigrationStatus` in `apps/web/lib/db/migrations.ts`
- [x] Backup/restore: `scripts/db-backup.sh` (pg_dump, gzip, 30-day retention)
- [x] Connection pooling: PgBouncer config documented in `config/production.env.example`; postgres.js internal pool for dev, PgBouncer sidecar recommended for production

### 6.2 Auth & Security
- [x] CSRF protection: `generateCsrfToken`, `validateCsrfToken` in `apps/web/lib/auth/csrf.ts`
- [x] Rate limiting: `checkRateLimit`, `getRateLimitHeaders` in `apps/web/lib/auth/rate-limit.ts`
- [x] Middleware: `apps/web/middleware.ts` applies rate limiting (100 req/min) + CSRF validation
- [x] Sandbox escape prevention audit: `runSecurityAudit()` / `formatAuditReport()` in `packages/sandbox/lib/security-audit.ts`; 13 checks (path traversal, auth, session binding, env allowlist, ulimits, timeouts, file size limits, container isolation, git arg filtering, timing-safe comparison); exposed via `GET /security-audit` endpoint

### 6.3 Observability
- [x] Metrics collector: `MetricsCollector` with counter/gauge/histogram + Prometheus export in `packages/shared/lib/metrics.ts`
- [x] API: `GET /api/metrics` returns Prometheus-format metrics
- [x] Structured logging: existing `logger` outputs structured JSON
- [x] Request ID propagation: existing `generateRequestId` / `getRequestIdFromHeaders` in shared

### 6.4 Reliability
- [x] Health checks: `GET /api/health` checks Postgres + Redis + Forgejo connectivity
- [x] Graceful shutdown: `setupGracefulShutdown` in `packages/agent/src/lib/graceful-shutdown.ts`
- [x] Dead letter queue: `moveToDeadLetter`, `listDeadLetterJobs`, `retryDeadLetterJob`, `discardDeadLetterJob` in `packages/shared/lib/dead-letter.ts`
- [x] Redis persistence config (AOF) documented in `config/production.env.example` — `appendonly yes`, `appendfsync everysec`

### 6.5 Performance
- [x] SSE connection pool: `canAcceptConnection`, `registerConnection`, `unregisterConnection`, `touchConnection`, `getConnectionStats` in `apps/web/lib/sse/connection-pool.ts`; integrated into session stream route with `SSE_MAX_CONNECTIONS` (default 500), idle timeout cleanup, 503 when at capacity
- [x] Sandbox warm pool: config documented in `config/production.env.example` (`SANDBOX_WARM_POOL_SIZE`); orchestration deferred to container scheduler
- [x] Model response caching: config documented in `config/production.env.example` (`MODEL_CACHE_TTL_SEC`); requires workspace hash tracking at runtime
- [x] Database query optimization: recommended indexes documented in `config/production.env.example`; EXPLAIN analysis deferred to load testing

---

## 7. UI Polish

### 7.1 Diff Viewer
- [x] PR detail renders Forgejo unified `.diff` with basic line colouring (`UnifiedDiffView`)
- [x] Side-by-side diff: `SideBySideDiff` component in `apps/web/components/diff/side-by-side-diff.tsx`
- [x] Syntax highlighting: regex-based tokenizer in `apps/web/components/diff/syntax-highlight.tsx` supporting JS/TS, Python, Go, Rust, HTML, CSS, JSON, YAML, Shell; integrated into `UnifiedDiffView` and `SideBySideDiff` with auto language detection from diff headers
- [x] Inline comment support on diff hunks (via `PRComments` component on PR detail page)

### 7.2 Code Editor
- [x] Textarea-based in-browser editor at `/:owner/:repo/edit/:branch/...path` (no Monaco dependency)
- [x] Save & commit flow: `FileEditor` component commits via `PUT /api/repos/.../contents/...`
- [x] File content API: `GET|PUT|POST|DELETE /api/repos/.../contents/...` (read, update, create, delete)

### 7.3 Global Search
- [x] Cross-repo search via `ForgejoClient.searchRepos` (Forgejo Bleve index)
- [x] UI: search page at `/search` with text input and repo result cards

### 7.4 Activity Feed
- [x] Dashboard: `/activity` page showing recent CI events, agent runs, and sessions
- [x] Grouped by type with icons, relative timestamps, and session/repo links

### 7.5 Notifications
- [x] Notification types + utilities: `apps/web/lib/notifications.ts`
- [x] API: `GET /api/notifications` derives unread from CI events + agent runs
- [x] UI: `NotificationBell` component polls every 30s, bell icon with unread badge + dropdown

### 7.6 Mobile Responsive
- [x] Responsive layout in middleware/shell (responsive breakpoints on sidebar + main content)

---

## Priority Order

1. **Webhook handler + reactive agent triggers** — unlocks the core autonomous loop
2. **Ask-user reply + spec approval** — makes agents interactive
3. **CI log streaming + agent-triggered CI** — closes the push → test → fix loop
4. **PR workflow (merge, review, comments)** — as service layer + tools + UI
5. **External sync (GitHub import/mirror)** — onboarding existing projects
6. **Verification loop + deliver phase** — full autonomous spec-to-merge pipeline
7. **Multi-agent coordination** — spec → implement → review → merge chain
8. **Org/team management** — required before multi-user deployment
9. **Production hardening** — before public launch
10. **UI polish** — ongoing

---
---

# Appendix: Detailed Reasoning & Context

This section provides the "why" and implementation context for every item above. Use this when picking up a task to understand its purpose, dependencies, edge cases, and how it fits into the agent-first architecture.

---

## 1. Forgejo Deep Integration

### 1.1 Webhook Handler

**Why this is #1 priority:** Without webhooks, the platform is purely request-driven — the user must manually trigger everything. Webhooks make the system reactive: code gets pushed → CI runs → CI fails → agent fixes it → pushes again. This is the autonomous loop that makes the platform valuable.

#### `push` events → update session state, trigger CI-failure agent runs
Forgejo fires a `push` webhook whenever commits land on any branch. We need this to:
- Track which sessions have new commits (update `sessions.linesAdded/linesRemoved`)
- Trigger CI (Forgejo Actions will do this natively, but we need to know it happened)
- If the push came from an agent and CI subsequently fails, we need to correlate it back to the session and enqueue a fix-attempt run

The handler should look up which `session` owns the branch (via `sessions.branch`), update its state, and insert a `ci_events` row. If CI was previously green and is now red, enqueue a new agent job with trigger `ci_failure`.

#### `pull_request` events (opened, closed, merged, review_requested)
When the agent creates a PR (via `create_pr` tool), Forgejo fires `pull_request.opened`. We store the PR number on the session (`sessions.prNumber`) and transition state. When merged, we mark the session `complete`. When `review_requested`, we can optionally spin up a review agent on that PR.

Key design consideration: the same PR events should work whether a human or an agent opened the PR. The webhook handler shouldn't care about the source — it just reacts to the event.

#### `pull_request_comment` events → trigger review-response agent
This is what enables the "agent responds to code review" flow. A human reviewer leaves a comment like "This function doesn't handle the error case." The webhook fires, we extract the comment text and diff context, and enqueue an agent run with trigger `review_comment`. The agent reads the comment, understands the context, makes the fix, and pushes.

The agent needs access to: the comment body, the file/line it's on, the surrounding diff, and the full PR context. We should pass this as `fixContext` in the job payload.

#### `status` / `workflow_run` events → update CI panel, trigger verify/fix loop
Forgejo fires commit status events when Actions jobs complete. We need to:
1. Update the `ci_events` table (status: running → success/failure)
2. Publish a stream event to the session's SSE so the UI CI panel updates in real-time
3. If the status is `failure` and the session is in `verify` phase, trigger the fix loop

#### Webhook signature verification (HMAC)
Forgejo signs webhooks with a shared secret (configured in `app.ini` or per-repo). We MUST verify `X-Forgejo-Signature` before processing — otherwise anyone can POST fake events and trigger agent runs or corrupt state. Implementation: `crypto.timingSafeEqual(computedHmac, providedSignature)`.

#### Event-to-agent dispatcher
This is the routing layer that maps a webhook event type + payload to a specific agent trigger. It should be configurable per-repo (via `.forge/agents.yml`) so users can decide which events trigger which agents. Default behavior:
- `push` on session branch → no agent action (CI handles it)
- `workflow_run.completed` with conclusion `failure` → `ci_failure` trigger
- `pull_request_comment.created` → `review_comment` trigger
- `pull_request.opened` (if reviewers assigned) → `pr_review` trigger

---

### 1.2 Repo Lifecycle

**Why:** Users need to create and manage repos without leaving our UI. Agents that scaffold new projects (e.g., "create a new microservice for the payments domain") need programmatic repo creation.

#### Service layer: `createRepo`, `deleteRepo`, `updateRepoSettings`, `forkRepo`
These wrap the Forgejo API (`POST /api/v1/user/repos`, `DELETE /api/v1/repos/:owner/:repo`, etc.). The service layer adds:
- Validation (repo name conventions, org membership check)
- Side effects (create default webhook pointing back to us, set up branch protection)
- Audit logging

The same service function is called by the API route (for UI) and by the agent tool definition. This is the core design principle in action.

#### Agent tool: `create_repo`
Use case: "Create a new service called `payment-gateway` with a Go module, Dockerfile, and CI workflow." The agent creates the repo, scaffolds files, pushes an initial commit. This tool calls the service layer's `createRepo`, then the agent uses `write_file` + `git` tools to populate it.

#### UI: repo creation form
Already partially exists (the `/repos/new` page). Needs to be wired to actually call the Forgejo API via our service layer. Should support: name, description, visibility (public/private), .gitignore template, license, default branch name.

---

### 1.3 Pull Request Workflow

**Why:** PRs are the fundamental unit of code review. Every agent coding session ends with a PR. Users review PRs. Review agents review PRs. The merge decision happens on a PR. This is where human oversight meets agent autonomy.

#### Service layer: `createPR`, `mergePR`, `closePR`, `requestReview`, `addPRComment`, `approvePR`
Each maps to a Forgejo API call but adds business logic:
- `createPR` → also updates the session's `prNumber`, publishes an event
- `mergePR` → checks branch protection (required approvals, CI status), updates session to `complete`
- `addPRComment` → if the commenter is the system review-agent, format differently than human comments
- `approvePR` → check if all required reviewers have approved before enabling merge

#### Agent tools
These are the tools an agent can call. Critical insight: **a review agent and an implementation agent use different subsets of these tools.**
- Implementation agent: `create_pr`, `add_pr_comment` (to explain changes)
- Review agent: `review_pr` (reads diff, posts comments), `approve_pr`, `request_changes`
- Merge agent: `merge_pr` (only if CI green + approvals met)

The tool definitions should enforce permissions — a review agent shouldn't be able to push code, and an implementation agent shouldn't be able to approve its own PR.

#### Trigger: "on PR opened" → spin up review agent
This is what makes the platform autonomous. When an implementation agent opens a PR, the webhook fires `pull_request.opened`. The dispatcher checks if a review agent is configured for this repo (via `.forge/agents.yml`). If so, it spins up a new agent session with the review agent's model/tools/prompt, passing the PR diff as context.

The review agent reads the diff, checks for bugs/style issues, and either approves or leaves comments. If it leaves comments, the implementation agent gets a `review_comment` trigger and fixes them. This ping-pong continues until the review agent approves.

#### "on PR approved + CI green" → auto-merge
This is optional per-repo behavior. If configured, when both conditions are met (all required approvals + all CI checks passing), the system automatically calls `mergePR`. No human in the loop needed for routine changes. Users can disable this for sensitive repos.

---

### 1.4 Branch Protection

**Why:** Without branch protection, an agent with the `merge_pr` tool could merge broken code to `main`. Branch protection is the safety net — it ensures that regardless of who (human or agent) tries to merge, the same rules apply.

#### Enforce: agent cannot merge without required approvals/CI pass
This is enforced at two levels:
1. Forgejo itself enforces branch protection (returns 403 if rules not met)
2. Our `mergePR` service function checks proactively and returns a helpful error ("Cannot merge: CI check `lint` is failing") rather than a cryptic Forgejo 403

This way, an agent that tries to merge prematurely gets a clear signal about what's blocking it, and can attempt to fix it (re-run CI, request review, etc.).

---

### 1.5 Code Review

**Why:** Code review is where the "agent reviews PRs" use case lives. This is a differentiating feature — most platforms have agents that write code, but an agent that provides thoughtful code review (security issues, performance concerns, style consistency) is highly valuable.

#### Agent tools: `review_pr` (reads diff, posts inline comments)
The `review_pr` tool should:
1. Fetch the PR diff from Forgejo API
2. Present it to the agent as context (file-by-file, with surrounding code)
3. The agent generates review comments with file/line references
4. Post each comment as an inline PR comment via Forgejo API
5. Submit the review (approve, request changes, or comment-only)

The diff should be chunked intelligently — for large PRs, the agent reviews file-by-file rather than getting the entire 5000-line diff at once.

#### Trigger: "on review comment" → notify or auto-respond agent
When a human posts a review comment, the implementation agent should see it and respond. Two modes:
1. **Notify mode**: Publish an `ask_user`-like event to the session — the agent is idle until the user triggers a response run
2. **Auto-respond mode**: Immediately enqueue a new agent run with the comment as context. The agent reads the comment, makes the fix, pushes, and replies "Fixed in abc1234"

The mode is configurable per-repo. Auto-respond is great for routine feedback ("add a docstring here") but risky for complex feedback ("rethink this architecture").

---

## 2. CI/CD Pipeline

### 2.1 Forgejo Actions Runner

**Why:** CI is what closes the quality loop. Without CI, the agent pushes code and hopes it works. With CI, the platform can verify that pushed code actually passes tests, builds correctly, and meets quality gates — and if it doesn't, trigger a fix.

#### Runner registration with Forgejo instance
Forgejo Actions uses runner tokens for authentication. Our `docker-compose.yml` already has a runner service, but it needs:
1. A registration step (call `POST /api/v1/repos/{owner}/{repo}/actions/runners/registration-token`)
2. Store the runner token
3. Runner polls Forgejo for pending jobs

We use the `act_runner` binary (Forgejo's official runner). It's already in our compose file — the gap is the initial token exchange and configuration.

#### Workflow file support
Users write `.forgejo/workflows/ci.yml` (GitHub Actions-compatible syntax). Our platform should:
- Show these files in the UI (under repo → Actions → Workflows)
- Provide templates for common setups (Node.js, Python, Go, Rust)
- An agent can create/modify workflow files just like any other code file

#### Job execution in Docker-in-Docker
The runner executes workflow steps inside Docker containers (hence the `docker-in-docker` service in compose). This provides isolation between CI jobs. Each job gets a fresh container with the repo cloned into it.

Security consideration: CI jobs run with access to repo secrets. The sandbox (for agent execution) is separate from CI (for workflow execution). They should NOT share the same execution environment.

#### Status reporting back to Forgejo
After a job completes, the runner reports status via Forgejo's commit status API. This is what makes the green/red checks appear on PRs and commits. Our webhook handler then picks up the status event and updates the UI.

---

### 2.2 Build Log Streaming

**Why:** When CI fails, both users and agents need to read the logs to understand what went wrong. Without streaming, users have to poll. Without agent access, the agent can't self-diagnose.

#### Service layer: `streamBuildLogs(runId)`
Forgejo stores build logs and exposes them via API (`GET /api/v1/repos/{owner}/{repo}/actions/runs/{runId}/jobs/{jobId}/logs`). Our service layer should:
- Fetch logs from Forgejo API
- Stream them as SSE events to the UI (live tailing during execution)
- After completion, cache the full log for quick replay

#### Agent access: agent can read build logs
When an agent gets a `ci_failure` trigger, it needs the build log as context. The job payload should include a reference to the failed CI run. The agent then uses a `read_build_log` tool (or receives the relevant log excerpt in its `fixContext`) to understand what failed.

Truncation matters here — build logs can be 100KB+. The agent should get the last N lines (typically the error output) plus the workflow step that failed, not the entire verbose build output.

---

### 2.3 Artifacts & Test Results

**Why:** Knowing "tests failed" isn't enough — the agent needs to know WHICH tests failed and WHY. Structured test results (JUnit XML) give the agent precise information: "test_payment_flow failed: expected 200, got 500 at line 43 of payment_test.go".

#### Test result parsing (JUnit XML, TAP)
Most test frameworks can output JUnit XML. Our CI runner should:
1. Detect test result files (configurable path, e.g., `test-results/*.xml`)
2. Parse them into structured data: test name, status, duration, failure message, stack trace
3. Store in `ci_events` or a new `test_results` table
4. Surface in UI (test results panel)
5. Make available to agents (the `fixContext` includes specific test failures)

This is what enables the agent to say "I need to fix `TestPaymentFlow` which is failing because the mock returns 500 instead of 200" rather than parsing raw log output.

---

### 2.4 Secrets & Environment

**Why:** Real-world CI needs secrets (API keys, deploy tokens, registry credentials). Without a secrets system, users can't run meaningful CI workflows.

#### Service layer: `setSecret`, `deleteSecret`, `listSecrets`
Maps to Forgejo's secrets API. Per-repo and per-org scoping. Values are write-only (can set and delete, but never read back in plaintext via API). Only injected into runner environment at job execution time.

Security constraint: Agents should NEVER have access to read secrets. An agent can trigger CI (which uses secrets), but cannot extract a secret value. The `listSecrets` service function returns names only, never values.

---

### 2.5 Agent-Triggered CI

**Why:** This is the "push → test → fix" autonomous loop. The agent pushes code. CI runs automatically (via Forgejo's native trigger). If CI fails, the agent should automatically attempt to fix it — without human intervention.

#### After agent pushes, trigger CI
This happens natively — Forgejo Actions triggers on push events defined in the workflow file. No extra work needed on our side, as long as the runner is registered and workflows exist.

#### Subscribe to CI result → enqueue fix-attempt
This is the webhook handler's job. When `workflow_run.completed` fires with `conclusion: failure`:
1. Look up which session owns this branch
2. Check if the session is in `execute` or `verify` phase
3. Check retry count (don't infinite-loop)
4. Fetch the relevant build log/test results
5. Enqueue a new agent job with trigger `ci_failure` and the failure context

#### Configurable max fix attempts
Default: 3. After 3 failed fix attempts, the session transitions to a "needs human input" state and the user gets a notification: "Agent couldn't fix CI after 3 attempts. Build log attached."

This prevents runaway loops where the agent keeps making the same mistake. The `agentRuns` table tracks `retryCount` and `maxRetries` for this purpose.

---

## 3. External Forge Sync

### 3.1 GitHub OAuth

**Why:** Most users already have code on GitHub. They won't migrate everything to a new platform on day one. GitHub sync lets them keep their GitHub repos as the source of truth while using our platform for AI-powered development. Over time, they may fully migrate.

#### OAuth2 flow for GitHub
Standard OAuth2 with scopes: `repo` (full repo access), `read:org` (to list org repos for import). The flow:
1. User clicks "Connect GitHub" in settings
2. Redirect to `github.com/login/oauth/authorize`
3. Callback stores the access token in `sync_connections`
4. We can now list their repos, clone them, push mirrors

#### Token refresh logic
GitHub tokens don't expire by default (personal access tokens), but GitHub Apps use expiring tokens. We should support both. For Apps: store `refresh_token`, check `expires_at` before API calls, refresh if needed.

---

### 3.2 GitLab OAuth

**Why:** Same reasoning as GitHub. GitLab is the second-most-common code host. Many enterprise users are on self-hosted GitLab.

#### GitLab-specific considerations
- GitLab OAuth tokens DO expire (2 hours by default)
- Must store `refresh_token` and handle refresh on every API call
- GitLab API is at `/api/v4/` (different from GitHub's `/api/v3/`)
- Self-hosted GitLab instances have custom URLs — the connection form needs a "GitLab URL" field

---

### 3.3 Mirror/Sync Engine

**Why:** Mirroring is what keeps code in sync between the local Forgejo instance and external forges. Without it, users have to manually push/pull between platforms.

#### Push mirror: local → external
After an agent (or human) pushes to the local Forgejo repo, automatically push those changes to the linked GitHub/GitLab repo. Use case: agent writes code on our platform, changes appear on GitHub for the rest of the team to see.

Implementation: Forgejo has built-in push mirror support (`POST /api/v1/repos/{owner}/{repo}/mirror-sync`). We configure the mirror target with the user's OAuth token as credentials.

#### Pull mirror: external → local
Periodically fetch from the external repo into the local Forgejo repo. Use case: team members push to GitHub directly, those changes sync to our platform so agents have the latest code.

Implementation: Forgejo supports pull mirrors natively. Configure via `PATCH /api/v1/repos/{owner}/{repo}` with `mirror: true` and `mirror_interval`.

#### Conflict resolution
If both sides change the same branch:
- **Push mirror conflicts**: Our push fails (non-fast-forward). Options: force-push (loses external changes), or alert the user.
- **Pull mirror conflicts**: External changes overwrite local. This is usually fine since the external is the source of truth.
- Best practice: local development happens on feature branches. Only `main` is mirrored from external. Agents work on feature branches that don't exist externally.

---

### 3.4 Import Wizard

**Why:** First-time user experience. When someone signs up, they want to immediately start using the platform with their existing projects. "Connect GitHub → Select repos → Import" should take under 60 seconds.

#### Multi-select repos from connected account
After GitHub OAuth, call `GET /user/repos` to list all repos the user has access to. Show them in a selectable list with checkboxes. Allow filtering by org, language, visibility.

#### Bulk import
For each selected repo:
1. Create a Forgejo repo with the same name (under the user's Forgejo namespace)
2. Clone from GitHub into Forgejo (Forgejo's migration API handles this: `POST /api/v1/repos/migrate`)
3. Set up the mirror relationship (push or pull, user's choice)
4. Copy over repo description, topics, default branch

---

### 3.5 Webhook Forwarding

**Why:** If the team is still primarily working on GitHub, events happen there (PR comments, issues, etc.). We need to forward those events into our system so agents can react to them.

#### Example: GitHub PR comment → trigger local agent
A team member reviews a PR on GitHub. Their comment should trigger a review-response agent on our platform. Flow:
1. GitHub webhook fires to our API (`POST /api/webhooks/github`)
2. We identify the local mirror repo
3. We create or find the corresponding session
4. Enqueue an agent run with trigger `review_comment` and the comment as context
5. Agent fixes the issue, pushes to local Forgejo
6. Push mirror syncs the fix back to GitHub
7. Agent posts a reply comment on the GitHub PR via GitHub API

This is complex but extremely powerful — it means the platform works even if the team hasn't fully migrated to Forgejo.

---

## 4. Agent Capabilities

### 4.1 Ask-User Reply Mechanism

**Why:** Agents sometimes need human input: "Should I use PostgreSQL or SQLite for this?" "The spec is ambiguous — which approach do you prefer?" Without a reply mechanism, the agent is either fully autonomous (risky) or fully manual (slow).

#### RPUSH/BLPOP pattern
The agent worker calls `BLPOP run:{runId}:ask:{toolCallId}` and blocks. The web API receives the user's reply via POST and does `RPUSH run:{runId}:ask:{toolCallId} "{answer}"`. The worker unblocks, receives the answer, and continues execution.

Timeout: If the user doesn't reply within N minutes, the agent should either use a default answer or abort gracefully (not hang forever). Use `BLPOP` with a timeout parameter.

#### UI wiring
The chat panel already renders `ask_user` prompts with buttons/free-text. The missing piece is the POST call: when the user clicks an option or submits text, it should hit `POST /api/sessions/:id/reply` with `{ toolCallId, answer }`. The route does `RPUSH` to the correct Redis key.

---

### 4.2 Spec Workflow

**Why:** Blindly executing code changes is dangerous. The spec phase forces the agent to THINK FIRST and get human approval before making changes. This catches architectural mistakes, scope creep, and misunderstandings before any code is written.

#### Agent generates spec
In the `spec` phase, the agent's system prompt directs it to output a structured spec:
- **Goal**: What are we trying to achieve?
- **Approach**: How will we achieve it? (Architecture decisions, libraries, patterns)
- **Files to modify/create**: Concrete list of what will change
- **Risks**: What could go wrong? Edge cases?
- **Verification plan**: How will we know it works? (Tests, manual checks)

The agent uses a `submit_spec` tool that validates the structure and publishes it as a `spec` stream event.

#### On approve → transition to execute
The spec panel in the UI shows the spec with "Approve" and "Reject" buttons. On approve:
1. Store the approved spec in the `specs` table (linked to session)
2. Transition `sessions.phase` to `execute`
3. Enqueue a new agent run that begins the execute phase, with the approved spec as context

The execute-phase agent uses the spec as its guide — it knows exactly which files to create/modify and what approach to use.

#### On reject → agent revises
The user can reject with feedback: "Don't use Redis for this — use PostgreSQL." This feedback becomes the agent's input for a new spec-phase run. The agent reads the rejection reason and revises its spec accordingly.

---

### 4.3 Verification Loop

**Why:** "It works on my machine" isn't good enough. Verification runs the actual tests/checks defined in the spec to confirm the implementation is correct. If it's not, the agent gets another shot at fixing it rather than dumping broken code on the user.

#### Run verification checks
Checks can be:
- Shell commands (`bun test`, `cargo check`, `python -m pytest`)
- Custom scripts defined in the spec
- CI workflow (if configured)

The sandbox `verify` method already supports this — it takes a list of `VerifyCheck` (name + command + timeout) and returns pass/fail/error per check.

#### If checks fail → re-enter execute with fix context
The agent gets the verification results: "2 of 5 checks passed. Failed: `test_payment_flow` (exit code 1, stderr: 'expected 200, got 500')". It re-enters the execute phase with this as context. The `fixContext` field in the job payload carries this information.

Retry limit is crucial here. Without it, the agent could loop forever. Default max: 3 fix attempts. After that, transition to a blocked state and ask the user.

---

### 4.4 Deliver Phase

**Why:** The final mile. Code is written, tests pass — now deliver it. This means pushing to a branch, creating a PR, and optionally merging. The deliver phase should be as automated as possible for routine work.

#### Agent pushes branch, creates PR
The agent's working branch (e.g., `agent/session-abc123`) gets pushed to Forgejo. Then the agent calls `create_pr` with a title derived from the session title and a body summarizing what was done (referencing the spec).

#### Wait for CI, fix if needed
If the repo has CI workflows, the PR triggers them. The agent's session stays in `deliver` phase, subscribed to CI events. If CI passes → proceed to merge (if auto-merge enabled). If CI fails → re-enter fix loop (limited retries).

#### Auto-merge
If configured (`sessions.project_config.autoMerge` or `sessions.project_config.auto_merge`), and Forgejo webhook reports `workflow_run` success for the branch, the server tries `FORGEJO_AGENT_TOKEN`-authenticated `merge_pull_request`. Forgejo branch protection decides required approvals / CI gates; merges that are blocked produce a logged warning rather than enqueueing retries.

---

### 4.5 Reactive Triggers

**Why:** The platform shouldn't just respond to user messages. It should react to events happening in the forge — like a team of developers who notice things and act on them.

#### `ci_failure` → new agent run with build log context
The most common trigger. Agent pushes code, CI fails. Instead of waiting for the user to notice and ask the agent to fix it, the platform automatically queues a fix run. The agent sees: "CI failed. Test `X` failed with error `Y`. Here are the last 50 lines of the build log."

#### `review_comment` → new agent run addressing review feedback
A reviewer (human or review-agent) posts a comment. The implementation agent gets a new run with context: "Review comment on file `payment.go`, line 42: 'This doesn't handle the nil case.' Please fix."

#### `pr_merged` → cleanup session, update status
Session lifecycle management. When the PR is merged (by user, agent, or auto-merge), the session should be marked `complete`, the sandbox can be reclaimed, and the activity feed should show the completion.

#### `schedule` → cron-triggered agent runs
Advanced use case: "Every Monday at 9am, run the dependency-update agent on all repos." This enables maintenance-style automation. Implementation: a scheduler service (or cron job) that enqueues agent runs on a timetable.

---

### 4.6 Multi-Agent Coordination

**Why:** Different tasks require different skills. A spec-writing agent needs deep domain understanding. An implementation agent needs to be methodical and tool-proficient. A review agent needs to be critical and security-aware. Splitting these into specialized agents with different prompts, models, and tool sets produces better results than one agent doing everything.

#### Session handoff protocol
When a spec agent finishes (spec approved), it creates an output artifact (the spec) and triggers the implementation agent. The implementation agent's session is linked to the spec agent's session — it inherits the repo context and receives the approved spec as input.

Similarly, when the implementation agent opens a PR, the review agent's session is triggered with that PR as input.

Data model: `sessions` has a `parentSessionId` field. The parent session's output (spec, PR number) is passed as context to the child session.

#### Configurable pipelines
The `.forge/agents.yml` defines the pipeline:
```yaml
pipeline:
  - role: spec
    model: anthropic/claude-sonnet-4-5
    trigger: user_message
  - role: implement
    model: anthropic/claude-sonnet-4-5
    trigger: spec_approved
    tools: [bash, git, read_file, write_file, edit_file, glob, grep, create_pr]
  - role: review
    model: anthropic/claude-sonnet-4-5
    trigger: pr_opened
    tools: [review_pr, add_pr_comment, approve_pr, request_changes]
  - role: merge
    trigger: pr_approved_and_ci_green
    auto: true
```

---

### 4.7 Agent Configuration

**Why:** Different repos need different agent behaviors. A frontend repo might want a review agent that checks for accessibility issues. A backend repo might want a review agent focused on security. Users need to configure this per-repo.

#### `.forge/agents.yml`
This file lives in the repo and defines:
- Which agents are active (spec, implement, review, etc.)
- What model each agent uses
- What tools each agent has access to
- What triggers activate each agent
- Custom system prompts (or prompt templates)
- Verification checks to run
- Auto-merge rules

The file is version-controlled with the code, so changes to agent behavior go through the same PR review process as code changes. An agent could even modify its own config (with human approval via PR).

---

## 5. Multi-Tenancy & Organizations

### 5.1 Organization Management

**Why:** Real teams need shared workspaces. A company wants all their repos under one org, with shared settings, billing, and member management. Forgejo organizations provide the namespace isolation.

#### Maps to Forgejo organizations
Forgejo orgs are first-class: `POST /api/v1/orgs` creates one. Repos under an org are namespaced (`org-name/repo-name`). Members have roles (owner, admin, member). Our platform's org model maps 1:1 to Forgejo orgs.

When we create a Forgejo org via API, we also create it in our DB (`organizations` table) with additional fields: billing plan, quota limits, feature flags.

---

### 5.2 Teams & Roles

**Why:** Not everyone should be able to merge to `main` or configure agent pipelines. Role-based access control ensures that junior developers can trigger agents and review PRs, but only admins can change branch protection or merge without review.

#### Permission checks on all service functions
Every service function (createPR, mergePR, updateRepoSettings, etc.) should take a `userId` and check permissions before executing. The check uses the Forgejo API (which already enforces its own permissions) PLUS our platform-level permissions (e.g., "can this user trigger agents on this repo?").

---

### 5.3 Resource Quotas

**Why:** Without quotas, one runaway agent session can consume all sandbox CPU, model tokens, and storage. Quotas protect both the platform operator (cost control) and other users (noisy neighbor problem).

#### Per-org limits
- **Sandbox minutes**: CPU time consumed by agent sessions (30s per exec call × many calls per session)
- **Model tokens**: Total tokens consumed by LLM calls (input + output). Tracked per-run.
- **Storage GB**: Disk usage across all sandboxes and repos for the org.
- **Concurrent sessions**: Max active agent runs at the same time (prevents queue flooding)

Enforcement happens at the service layer: before enqueuing a job, check if the org has remaining quota. If not, return a 429-style error. The UI shows usage dashboards so admins can track consumption.

---

## 6. Production Hardening

### 6.1 Database

#### Migration strategy
Currently we use `drizzle-kit push` which modifies the schema in-place with no rollback. For production:
1. `drizzle-kit generate` creates migration SQL files (versioned, committed to repo)
2. `drizzle-kit migrate` applies pending migrations in order
3. Each migration is idempotent and has a rollback counterpart
4. CI runs migrations against a test DB to verify they don't break

#### Connection pooling
PostgreSQL has a hard connection limit (default: 100). Our web app, agent workers, and other services all need connections. Options:
- PgBouncer as a sidecar (pool connections at the proxy level)
- `postgres.js` library already pools internally — configure `max` appropriately
- Monitor with `pg_stat_activity` to catch leaks

---

### 6.2 Auth & Security

#### Token refresh
Forgejo OAuth tokens expire (configurable, default 1 hour). The `session` cookie stores the access token. On API calls, if we get a 401 from Forgejo, attempt a refresh using the stored `refresh_token`. If refresh fails, redirect user to re-login.

Implementation: middleware that wraps all Forgejo API calls with a refresh-on-401 retry.

#### Sandbox escape prevention
The sandbox runs arbitrary user/agent code. It MUST be isolated:
- No network access to internal services (Forgejo, Redis, Postgres) from inside the sandbox
- Filesystem is scoped to `/workspace/{sessionId}/`
- Resource limits: CPU, memory, disk, process count
- No access to the host Docker socket

Audit checklist: can a malicious bash command inside the sandbox read Redis? Access Forgejo's admin API? Write to another session's workspace? All must be "no."

---

### 6.3 Observability

#### Metrics
Key metrics to track:
- `agent_run_duration_seconds` (histogram, labeled by phase and model)
- `agent_run_result` (counter, labeled: success, failure, aborted, timeout)
- `model_tokens_used` (counter, labeled by model and direction: input/output)
- `job_queue_depth` (gauge — how many jobs waiting)
- `job_queue_wait_time` (histogram — time from enqueue to start)
- `sandbox_exec_duration` (histogram)
- `sse_active_connections` (gauge)

These should be exposed as Prometheus metrics or sent to a metrics service.

---

### 6.4 Reliability

#### Graceful shutdown
When the agent worker process receives SIGTERM:
1. Stop accepting new jobs from the queue
2. Wait for in-flight jobs to complete (with a timeout, e.g., 60s)
3. For jobs that don't complete, the Redis PEL (Pending Entry List) preserves them
4. The `reclaimStalePending` function on the next worker picks them up

This ensures no jobs are lost during deployments.

#### Dead letter queue
After `maxRetries` (default 3), a job is moved to a dead letter list rather than being retried forever. The dead letter queue should:
- Store the full job payload + failure reason
- Be visible in an admin UI
- Alert operators
- Allow manual retry or discard

---

### 6.5 Performance

#### Sandbox warm pool
Cold-starting a sandbox (clone repo, install deps) takes 10-30 seconds. For frequent users, we can maintain a pool of pre-warmed sandboxes with the repo already cloned. When a new session starts, grab a warm sandbox instead of starting from scratch.

Implementation: background job that pre-clones repos for active sessions. When a session ends, recycle its sandbox into the warm pool (reset state, keep repo clone).

#### Model response caching
Some tool calls produce deterministic results (e.g., `glob("**/*.ts")` on an unchanged workspace). Caching these results avoids redundant LLM round-trips where the agent re-reads the same file multiple times.

Cache key: `{sessionId}:{toolName}:{argsHash}:{workspaceHash}`. Invalidate on any `writeFile` or `exec` that modifies the workspace.

---

## 7. UI Polish

### 7.1 Diff Viewer

**Why:** PRs are meaningless without a good diff view. Users and review agents both need to see exactly what changed, with syntax highlighting and the ability to comment on specific lines.

The shared `packages/shared/lib/diff.ts` already has `createUnifiedDiff`, `createEditDiffLines`, `splitLines`, and `getLanguageFromPath`. The UI component wraps these to render:
- Green/red line highlighting for additions/deletions
- Line numbers
- Expand/collapse context
- Click-to-comment on a line (for code review)

---

### 7.2 Code Editor

**Why:** Sometimes you just want to fix a typo without waiting for an agent. An in-browser editor with "save → commit → push" gives users a quick escape hatch.

Monaco is heavier but more capable (VS Code experience). CodeMirror 6 is lighter and more embeddable. For our use case (quick edits, not full IDE), CodeMirror 6 is probably sufficient.

---

### 7.5 Notifications

**Why:** The whole point of autonomous agents is that they work in the background. But users need to know when attention is required: "Agent needs your input", "CI failed and agent couldn't fix it", "PR is ready for review."

Implementation options:
- **WebSocket**: Real-time, bidirectional, requires sticky sessions or Redis pub/sub fanout
- **SSE**: Simpler, server-push only, already used for session streaming
- **Polling**: Simplest, slight delay, no infra requirements

Recommendation: Start with polling (check `/api/notifications` every 30s), migrate to SSE when the infrastructure supports it. The notification bell in the top bar shows unread count. Clicking opens a dropdown with recent notifications grouped by type.
