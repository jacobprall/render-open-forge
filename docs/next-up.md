# Next Up: High-Impact Features — IMPLEMENTED

Two features that build directly on existing infrastructure and close the biggest gaps in the product loop. Both are now implemented.

---

## 1. Trust Tiers for Render Tools

### Problem

The agent's Render tools can create services, provision databases, delete resources, and set env vars. The only guardrail is a system prompt instruction: "confirm with the user before creating resources." Nothing enforces this -- a hallucinating or overeager agent can provision a $100/month database without asking.

### What to build

A lightweight middleware layer in the tool registry that classifies each Render tool by risk level and enforces confirmation before execution.

**Tier model:**

| Tier | Behavior | Tools |
|------|----------|-------|
| Read | Always execute | `render_list_services`, `render_get_service`, `render_get_deploy_status`, `render_get_logs`, `render_list_env_vars`, `render_list_postgres`, `render_get_postgres_connection`, `render_project_status` |
| Deploy | Execute with cost note | `render_deploy` |
| Create | Require user confirmation with cost estimate | `render_create_service`, `render_create_postgres`, `render_create_redis`, `render_set_env_vars`, `render_create_preview` |
| Destructive | Always require explicit user confirmation | `render_delete_preview` (and future `render_delete_service`, `render_scale_to_zero`) |

### How it works

Wrap Create/Destructive tier tools so that `execute` emits an `ask_user_question` event before proceeding. The wrapper:

1. Computes the cost estimate from `estimateMonthlyCostCents`
2. Formats a confirmation message: "This will create a Starter web service (~$7/month). Proceed?"
3. Pauses execution until the user responds via the existing `ask_user_question` reply channel
4. If confirmed, runs the original tool. If declined, returns a cancellation result.

### Where it lives

- `apps/agent/src/tool-registry.ts` -- wrap tools at registration time
- No new database tables, no new API routes
- Confirmation flows through the existing `ask_user_question` / Redis reply mechanism

### Scope

Small. The tool registry already has the conditional Render tool block. Adding a `withConfirmation` wrapper around specific tools is ~100 lines. The cost estimation functions already exist in `@openforge/render-client`.

---

## 2. Reactive Sessions from Deploy Webhooks

### Problem

When a Render deploy fails, the user has to notice, come back to OpenForge, start a session, and ask the agent to diagnose. The agent has all the tools to do this autonomously -- it just doesn't know the deploy failed.

### What to build

A webhook endpoint that receives Render deploy status events and auto-creates a diagnostic agent session when a deploy fails.

**Flow:**

```
Render deploy fails
  -> POST /api/webhooks/render (new route)
  -> Look up which session/repo owns this service (via infraResources table)
  -> Create a new session with goal: "Diagnose deploy failure on {service}"
  -> Inject context: service ID, deploy ID, failure status
  -> Enqueue an agent job with a pre-filled first message
  -> Agent runs: reads logs, diagnoses, either fixes and redeploys or surfaces the issue to the user
```

### Webhook payload

Render sends deploy status webhooks with service ID, deploy ID, status, and commit info. The route validates a shared secret (`RENDER_WEBHOOK_SECRET`), extracts the failure, and triggers the session.

### Where it lives

- `apps/web/app/api/webhooks/render/route.ts` -- new route, ~80 lines
- `packages/platform/src/services/session.ts` -- add a `createFromWebhook` method that sets up the session with pre-populated context and auto-enqueues the first agent job
- `render.yaml` -- add `RENDER_WEBHOOK_SECRET` env var

### User experience

- User gets a notification (existing inbox/SSE system) that a deploy failed and the agent is investigating
- The session appears in their session list with status "running" and a title like "Deploy failure: api-service"
- The agent's first message summarizes what it found in the logs
- If the fix is a code change, the agent opens a PR. If it's an env var or config issue, the agent asks for confirmation before applying

### Scope

Medium. The webhook route is straightforward. The session auto-creation with context injection requires threading a `systemMessage` or `projectContext` through the session creation flow, which is already supported via `CreateSessionParams`. The notification uses the existing inbox event bus. Main work is the webhook route, the service-to-session lookup, and the pre-filled agent prompt.

### Setup

Users configure a Render notification webhook in the Render Dashboard pointing at `https://<openforge-url>/api/webhooks/render` with the shared secret. This is a one-time manual step documented in the README.

---

## What these enable together

With both features, the product loop becomes:

1. User describes what to build
2. Agent writes code, opens PR, creates preview (existing)
3. Agent asks "Deploy preview for ~$7/month?" -- user confirms (trust tiers)
4. Preview deploys. If it fails, agent auto-diagnoses and fixes (reactive sessions)
5. User reviews, merges. Production deploy triggers.
6. If production deploy fails, agent auto-creates a diagnostic session (reactive sessions)

The agent goes from "writes code and opens PRs" to "ships software and keeps it running."
