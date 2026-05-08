# openforge-ci

Render Workflows task worker that executes CI jobs dispatched by the web app.

## Quick Start

```bash
# Starts automatically with the monorepo dev command
bun run dev            # from monorepo root

# Or run standalone
bun run src/index.ts

# Local mode (no Render Workflows dependency)
CI_RUNNER_MODE=local bun run src/index.ts
```

## How It Works

1. **Receive task** — the web app dispatches a CI job (via Render Workflows or directly in local mode).
2. **Shallow clone** — the runner performs a shallow `git clone` of the target repository.
3. **Execute steps** — runs each `run:` shell step defined in `.forgejo/workflows/*.yml` files.
4. **Capture results** — collects logs and scans for JUnit / TAP test output.
5. **Report back** — POSTs results to the web app at `/api/ci/results`.

## Key Files

| Path | Description |
|------|-------------|
| `src/index.ts` | Entry point and task router |
| `src/tasks/run-ci-job.ts` | Core job execution logic |
| `src/lib/step-executor.ts` | Shell step runner with log capture |
| `src/lib/result-parser.ts` | JUnit / TAP result scanner |
| `src/lib/combined-output.ts` | Output aggregation utilities |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CI_RUNNER_MODE` | Set to `local` to bypass Render Workflows and run jobs directly |
| `CI_RUNNER_SECRET` | Shared secret with the web app for callback authentication |

## Workspace Dependencies

- **`@openforge/shared`** — shared types and constants
- **`@renderinc/sdk`** — Render platform SDK (workflow task integration)

## Notable External Dependencies

- `yaml` — parses workflow YAML files

## Exports

This package also exports modules consumed by the web app:

- `@openforge/ci-runner` — main entry
- `@openforge/ci-runner/tasks/run-ci-job`
- `@openforge/ci-runner/lib/step-executor`
- `@openforge/ci-runner/lib/result-parser`
- `@openforge/ci-runner/lib/combined-output`

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `bun run --watch src/index.ts` |
| `start` | `bun run src/index.ts` |
| `typecheck` | `tsc --noEmit` |
