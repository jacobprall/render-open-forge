---
name: deploy-render
description: Deploy OpenForge to Render — provision blueprint, set env vars, create Forgejo admin, run setup, push DB schema, and verify health. Use when the user says deploy, deploy to Render, set up production, provision, or asks about Render deployment steps.
---

# Deploy OpenForge to Render

## Quick Path: Automated Script

If the user has `RENDER_API_KEY`, `ANTHROPIC_API_KEY`, and Forgejo admin credentials ready, run the automated script:

```bash
RENDER_API_KEY=rnd_xxx \
ANTHROPIC_API_KEY=sk-ant-xxx \
FORGEJO_ADMIN_PASSWORD=<password> \
FORGEJO_ADMIN_EMAIL=<email> \
bun run deploy:render
```

This handles steps 2–9 below automatically. If it fails at admin creation (requires Render Shell), follow the manual fallback in step 5.

## Full Manual Workflow

Use this when the automated script isn't suitable or when troubleshooting.

### Step 1: Provision the Blueprint

1. Ensure `render.yaml` is committed and pushed to the repo
2. Go to [render.com/new/blueprint](https://render.com/new/blueprint)
3. Connect the fork/repo
4. Render creates all services, databases, Redis, and auto-wires `fromService`/`fromDatabase`/`generateValue` env vars

### Step 2: Set Pre-Deploy Env Vars

Set these immediately via the Render Dashboard (or API). You have these values already:

| Variable | Service(s) | Source |
|---|---|---|
| `ANTHROPIC_API_KEY` | openforge-web, openforge-agent | Anthropic account |
| `RENDER_API_KEY` | openforge-web | Render Dashboard → Account → API Keys |

**Via CLI:**

```bash
# Find service IDs
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services | jq '.[].service | {name, id}'

# Set env var on a service
curl -X PUT -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value":"sk-ant-xxx"}' \
  https://api.render.com/v1/services/<SERVICE_ID>/env-vars/ANTHROPIC_API_KEY
```

### Step 3: Wait for Forgejo to Boot

Forgejo takes ~10–15s to initialize. It may restart once or twice before the health check at `/api/v1/version` passes. This is normal.

Once healthy, note the public URL: `https://openforge-forgejo-xxxx.onrender.com`

### Step 4: Set Forgejo URLs

| Variable | Service | Value |
|---|---|---|
| `FORGEJO__server__ROOT_URL` | openforge-forgejo | Forgejo's public URL |
| `FORGEJO_EXTERNAL_URL` | openforge-web | Same Forgejo URL |

Redeploy `openforge-forgejo` after setting `ROOT_URL`.

### Step 5: Create Forgejo Admin User

Open a **Shell** on the `openforge-forgejo` service in the Render Dashboard:

```bash
su -c 'forgejo admin user create --admin --username forge-admin --password <password> --email <email>' git
```

**Important:** Must run as the `git` user (not root) — Forgejo refuses to run as root.

### Step 6: Run Forgejo Setup Script

Run **locally** from the project root:

```bash
FORGEJO_INTERNAL_URL=https://openforge-forgejo-xxxx.onrender.com \
FORGEJO_ADMIN_USER=forge-admin \
FORGEJO_ADMIN_PASSWORD=<password> \
FORGEJO_EXTERNAL_URL=https://openforge-web-xxxx.onrender.com \
bun run setup
```

The script outputs three values — capture them:
- `FORGEJO_AGENT_TOKEN`
- `FORGEJO_OAUTH_CLIENT_ID`
- `FORGEJO_OAUTH_CLIENT_SECRET`

### Step 7: Set Derived Env Vars

| Variable | Service(s) |
|---|---|
| `FORGEJO_AGENT_TOKEN` | openforge-web, openforge-agent, openforge-gateway |
| `FORGEJO_OAUTH_CLIENT_ID` | openforge-web |
| `FORGEJO_OAUTH_CLIENT_SECRET` | openforge-web |
| `CI_CALLBACK_URL` | openforge-web (`https://openforge-web-xxxx.onrender.com/api/ci/callback`) |
| `FORGEJO_WEBHOOK_SECRET` | openforge-gateway (random string, e.g. `openssl rand -hex 32`) |

### Step 8: Set Up CI Workflow

Render Workflows can't be defined in Blueprints. Create manually:

1. Dashboard → **Workflows** → **New Workflow**
2. Connect repo, root directory: `apps/ci-runner`
3. Build command: `bun install && npx turbo build --filter=@openforge/ci-runner`
4. Env vars:
   - `FORGEJO_INTERNAL_URL` = `http://openforge-forgejo:3000`
   - `FORGEJO_AGENT_TOKEN` = same token
   - `CI_RUNNER_SECRET` = copy from openforge-web

### Step 9: Push Database Schema

```bash
DATABASE_URL="<external-connection-string>?sslmode=require" bun run db:push
```

Get the external connection string from `openforge-db` in the Render Dashboard.

### Step 10: Bootstrap the Admin User

Seeds the first admin user into Postgres and links it to the Forgejo admin account:

```bash
DATABASE_URL="<external-connection-string>?sslmode=require" \
FORGEJO_INTERNAL_URL=https://openforge-forgejo-xxxx.onrender.com \
FORGEJO_AGENT_TOKEN=<agent-token> \
ADMIN_EMAIL=<email> \
ADMIN_PASSWORD=<web-login-password> \
FORGEJO_ADMIN_PASSWORD=<forgejo-admin-password> \
bun run apps/web/scripts/bootstrap-admin.ts
```

`ADMIN_PASSWORD` is the password for signing in to the web app. It can differ from the Forgejo admin password.

### Step 11: Redeploy & Verify

Redeploy all services to pick up new env vars, then check:

```bash
curl https://openforge-web-xxxx.onrender.com/api/health
# → {"status":"healthy","checks":{"postgres":{"status":"ok"},"redis":{"status":"ok"},"forgejo":{"status":"ok"}}}

curl https://openforge-web-xxxx.onrender.com/api/health/workers
# → {"hasActiveWorkers": true}
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Forgejo crash loops on startup | Normal — takes ~10s to boot. Wait for 2–3 restarts. Remove `healthCheckPath` temporarily if it persists. |
| `bun install --frozen-lockfile` fails in Docker | Bun version mismatch. Pin the exact version in the Dockerfile (e.g. `oven/bun:1.2.19`). |
| Turbo `--filter` can't find package | Use the full scoped name: `--filter=@openforge/web` not `--filter=web` |
| `Forgejo is not supposed to be run as root` | Run CLI commands as the `git` user: `su -c '...' git` |
| CI runner exits immediately | Expected for Render Workflows — the process registers tasks and exits. Deploy as a Workflow, not a worker. |

## Auto-Handled Env Vars (No Action Needed)

These are wired automatically by the Blueprint:

- `DATABASE_URL` — from `openforge-db`
- `REDIS_URL` — from `openforge-redis`
- `AUTH_SECRET`, `ENCRYPTION_KEY`, `CI_RUNNER_SECRET` — `generateValue` on openforge-web
- `GATEWAY_API_SECRET` — `generateValue` on openforge-gateway
- `SANDBOX_SHARED_SECRET`, `SANDBOX_SESSION_SECRET` — `generateValue`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — `generateValue`, shared with Forgejo via `fromService`
- `ENCRYPTION_KEY` on agent/gateway — pulled from web via `fromService`
