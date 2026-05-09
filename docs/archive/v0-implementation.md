# v0: Dead Simple Render Agent

> The smallest thing that proves the core thesis: an agent that ships software, not just writes code.

## What v0 Proves

The agent can:
1. Write code
2. Deploy it to real infrastructure (Render)
3. Verify it works
4. Fix it if it doesn't

## What We Build

**5 Render MCP tools + system prompt update. ~400 lines. Zero new abstractions.**

### Tool Surface

| Tool | Render API | What It Does |
|---|---|---|
| `render_list_services` | `GET /services` | List services, status, URLs |
| `render_deploy` | `POST /services/{id}/deploys` | Trigger a deploy |
| `render_get_deploy_status` | `GET /services/{id}/deploys/{deployId}` | Poll deploy until terminal |
| `render_get_logs` | `GET /services/{id}/logs` | Read build/runtime logs |
| `render_set_env_vars` | `PUT /services/{id}/env-vars` | Set environment variables |

### File Structure

```
packages/render-client/       <-- Typed Render API wrapper
  src/client.ts
  src/types.ts
  src/index.ts
  package.json
  tsconfig.json

apps/agent/src/tools/render.ts <-- 5 tool definitions
apps/agent/src/system-prompt.ts <-- Updated with Render context
```

### What We Don't Build

- No Spec/Resource reconciler (the agent IS the reconciler)
- No CostLedger, Policies, Checkpoints
- No Connection abstraction
- No event store beyond existing session logs
- No Environment model
- No Blueprint/Template system

## The Demo

```
User: "Build a todo API and deploy it"
Agent: writes Express app, pushes, deploys, polls, returns live URL
       if deploy fails: reads logs, fixes, redeploys
```

## Progression

- **v0:** 7 Render tools, deploy/monitor existing services *(current)*
- **v1:** + 6 provisioning tools (create service/postgres/redis), cost estimation, live state summary in system prompt, tool result enrichment
- **v2:** + 4 Postgres tables (specs, resources, actions, observations), action logging, resource tracking, observation injection into agent context
- **v3:** + Reconciler (diff specs vs resources, auto-converge), connection auto-wiring, state diffing between turns
- **v4:** + Autonomous sessions triggered by observations, background reconciliation loop, template variables
- **v5:** + CostLedger, full Policy engine, environment forking, checkpoints

---

*Document created: May 8, 2026*
*Previous: [Extended Data Models](./extended-data-models.md)*
*Next: [v1 & v2 Plans](./v1-v2-plans.md) | [v3+ Live System State](./v3-live-system-state.md)*
