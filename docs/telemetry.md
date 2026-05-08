# Telemetry

## Goal

Add distributed tracing, metrics, and structured logging across all OpenForge services using the OpenTelemetry SDK, with Postgres as the telemetry storage backend. The OTLP receiver lives in the Hono gateway service (`apps/gateway`), not the Next.js frontend.

## Decisions

### 1. No external collector — write OTLP directly to Postgres via the Hono gateway

The standard OTel architecture routes telemetry through a standalone collector process that fans out to backends (Jaeger, Prometheus, Grafana Cloud, etc.). We skip the collector and instead accept OTLP HTTP exports directly via Hono route handlers in `apps/gateway`, inserting into the same Postgres database the app already uses.

The Hono gateway is the right host for the OTLP receiver because:

- **Telemetry ingestion is infrastructure, not UI.** The Next.js app serves the frontend and user-facing API routes. Receiving OTLP payloads from every service and batch-inserting into Postgres is backend plumbing — exactly what the gateway exists for.
- **Isolates write load.** OTLP exports are high-frequency writes. Handling them in the gateway keeps that traffic off the Next.js process, which is busy with SSR, auth, SSE streaming, and webhooks.
- **The gateway already sits between services.** As the orchestration layer, it naturally aggregates cross-service concerns. Telemetry ingestion, health aggregation, and the Prometheus scrape endpoint all belong here.
- **`packages/platform` already owns the building blocks.** The platform package has `createDb`, `RedisEventBus`, `metrics.ts`, and the `StorageAdapter` interface. The OTLP receiver calls platform functions; the Hono routes are a thin HTTP shell.
- **Service-to-service auth is simpler.** Internal `OTEL_INGEST_SECRET` validation is gateway logic, not app logic. The Next.js app shouldn't need to know about internal service auth tokens.

**Why Postgres (not Jaeger/Tempo/external):**

- Zero new infrastructure beyond what we already run.
- Telemetry is queryable with SQL alongside app data. A trace can be joined to an `agent_runs` row by `run_id`, giving us "show me every span for this agent job" without leaving Postgres.
- Render's Blueprint can deploy this without additional Docker services.

**Trade-offs accepted:**

- We lose purpose-built trace UIs (Jaeger waterfall, Grafana Tempo). We'll build a lightweight trace viewer in the web app instead (reads from Postgres).
- High-cardinality writes at scale could pressure the DB. Acceptable at current traffic levels; we add a retention policy to prune old telemetry.
- If we later need fan-out to a managed APM, we can add a collector in front of the OTLP routes without changing SDK instrumentation.

### 2. Shared `packages/telemetry` workspace package

A new `packages/telemetry` package owns all OTel SDK initialization. Every service calls `setupTelemetry({ serviceName })` at startup before other imports. This keeps OTel dependency versions and configuration in one place.

**Exports:**

| Export | Purpose |
|--------|---------|
| `setupTelemetry(opts)` | Initializes the OTel SDK: tracer provider, meter provider, log provider, OTLP HTTP exporters. Must be called once, before anything else. |
| `getTracer(name?)` | Returns an `api.Tracer` scoped to a component (e.g., `"agent"`, `"worker"`, `"sandbox"`). |
| `getMeter(name?)` | Returns an `api.Meter` for creating counters, histograms, gauges. |
| `getLogger(name?)` | Returns an `api.Logger` for structured log records. |

**Configuration via environment variables (OTel-standard):**

| Variable | Default | Notes |
|----------|---------|-------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4500` | Points to the Hono gateway in dev. |
| `OTEL_SERVICE_NAME` | (required per service) | `openforge-web`, `openforge-gateway`, `openforge-agent`, `openforge-ci`, `openforge-sandbox` |
| `OTEL_ENABLED` | `true` | Set to `false` to disable telemetry entirely (e.g., in tests). |

### 3. OTel SDK packages

```
@opentelemetry/api
@opentelemetry/sdk-node
@opentelemetry/sdk-trace-node
@opentelemetry/sdk-metrics
@opentelemetry/sdk-logs
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/exporter-metrics-otlp-http
@opentelemetry/exporter-logs-otlp-http
@opentelemetry/resources
@opentelemetry/semantic-conventions

# Auto-instrumentation (Node services only — see §7 for Bun caveats):
@opentelemetry/instrumentation-http
@opentelemetry/instrumentation-fetch
@opentelemetry/instrumentation-pg
@opentelemetry/instrumentation-ioredis
```

For Next.js specifically, `@vercel/otel` wraps the SDK and integrates with the `instrumentation.ts` hook. We use it for `apps/web` only.

### 4. Postgres schema for telemetry

Three tables in the existing database, managed by Drizzle alongside the app schema.

#### `otel_spans`

Stores trace spans. One row per span.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | UUID, generated on insert |
| `trace_id` | `text` NOT NULL | 32-hex-char W3C trace ID |
| `span_id` | `text` NOT NULL | 16-hex-char span ID |
| `parent_span_id` | `text` | Null for root spans |
| `service_name` | `text` NOT NULL | From resource attributes |
| `name` | `text` NOT NULL | Operation name |
| `kind` | `text` NOT NULL | `SERVER`, `CLIENT`, `INTERNAL`, `PRODUCER`, `CONSUMER` |
| `status` | `text` NOT NULL | `OK`, `ERROR`, `UNSET` |
| `status_message` | `text` | Error message if status is `ERROR` |
| `start_time` | `timestamp(3)` NOT NULL | Microsecond precision from OTel, stored as millisecond timestamp |
| `end_time` | `timestamp(3)` NOT NULL | |
| `duration_ms` | `real` NOT NULL | Computed: `end_time - start_time` in ms |
| `attributes` | `jsonb` | Span attributes (http.method, db.statement, etc.) |
| `events` | `jsonb` | Span events array (exceptions, annotations) |
| `links` | `jsonb` | Span links array |
| `resource` | `jsonb` | Full resource attributes |

**Indexes:**

- `otel_spans_trace_id_idx` on `(trace_id)` — fetch all spans in a trace
- `otel_spans_service_time_idx` on `(service_name, start_time)` — filter by service + time range
- `otel_spans_start_time_idx` on `(start_time)` — retention cleanup

#### `otel_metrics`

Stores metric data points. Each row is a single data point from a metric instrument.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | UUID |
| `service_name` | `text` NOT NULL | |
| `metric_name` | `text` NOT NULL | e.g., `agent.llm.duration_ms` |
| `metric_type` | `text` NOT NULL | `counter`, `gauge`, `histogram` |
| `value` | `double precision` NOT NULL | Numeric value |
| `attributes` | `jsonb` | Metric attributes / labels |
| `resource` | `jsonb` | Resource attributes |
| `timestamp` | `timestamp(3)` NOT NULL | |

**Indexes:**

- `otel_metrics_name_time_idx` on `(metric_name, timestamp)`
- `otel_metrics_service_time_idx` on `(service_name, timestamp)`

#### `otel_logs`

Stores structured log records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | UUID |
| `service_name` | `text` NOT NULL | |
| `severity` | `text` NOT NULL | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` |
| `body` | `text` | Log message body |
| `attributes` | `jsonb` | Log attributes |
| `resource` | `jsonb` | Resource attributes |
| `trace_id` | `text` | Correlate logs to traces |
| `span_id` | `text` | Correlate logs to spans |
| `timestamp` | `timestamp(3)` NOT NULL | |

**Indexes:**

- `otel_logs_service_time_idx` on `(service_name, timestamp)`
- `otel_logs_trace_id_idx` on `(trace_id)` — find logs for a trace
- `otel_logs_severity_idx` on `(severity, timestamp)`

### 5. OTLP HTTP receiver routes (Hono gateway)

Three Hono route handlers in `apps/gateway` that accept standard OTLP HTTP JSON exports and batch-insert into Postgres. The ingestion logic itself lives in `packages/platform/src/observability/` so it's reusable and testable independent of the HTTP framework.

| Route | Accepts | Inserts into |
|-------|---------|-------------|
| `POST /v1/traces` | `ExportTraceServiceRequest` JSON | `otel_spans` |
| `POST /v1/metrics` | `ExportMetricsServiceRequest` JSON | `otel_metrics` |
| `POST /v1/logs` | `ExportLogsServiceRequest` JSON | `otel_logs` |

The paths follow the OTLP HTTP spec convention (`/v1/traces`, `/v1/metrics`, `/v1/logs`), so the OTel SDK works with zero path configuration — just set `OTEL_EXPORTER_OTLP_ENDPOINT` to the gateway base URL.

Each route:

1. Validates the `Content-Type` header (`application/json`).
2. Verifies the `Authorization: Bearer <OTEL_INGEST_SECRET>` header.
3. Parses the OTLP JSON payload (well-defined protobuf-to-JSON mapping from the OTel spec).
4. Delegates to a platform-layer function (`ingestSpans`, `ingestMetrics`, `ingestLogs`) that flattens the nested resource → scope → span/metric/log structure into rows and batch-inserts with Drizzle.
5. Returns `200 {}` (partial success not supported initially).

**Why `/v1/*` instead of `/api/telemetry/*`:** The OTLP HTTP exporter appends `/v1/traces` (etc.) to the configured endpoint by default. Using the standard paths means services only need `OTEL_EXPORTER_OTLP_ENDPOINT=http://gateway:4500` with no per-signal path overrides.

Authentication: These routes are internal (service-to-service). In production on Render, services communicate over private networking. For defense in depth, the routes validate a shared `OTEL_INGEST_SECRET` bearer token. In dev, the secret defaults to a known value.

### 5a. Gateway also hosts `/metrics` and `/health`

While we're at it, the Prometheus scrape endpoint (`/metrics`) and the aggregated health check (`/health`) are better served from the gateway than from Next.js:

- `/metrics` — reads from the OTel `MeterProvider`'s in-memory reader or queries `otel_metrics`. Replaces the existing `apps/web/app/api/metrics/route.ts`.
- `/health` — the existing health check logic (Postgres ping, Redis ping, Forgejo version) moves to a platform-layer function; the gateway exposes it. The Next.js app can keep a slim `/api/health` that delegates to the gateway, or Render's health check can point directly at the gateway.

### 6. Per-service instrumentation

#### `apps/gateway` (Hono on Bun/Node)

- Call `setupTelemetry({ serviceName: 'openforge-gateway' })` at startup.
- The gateway itself is instrumented: incoming OTLP requests get their own spans (meta-telemetry), plus any proxied or orchestrated requests.
- The OTLP receiver routes do **not** re-export their own ingested spans to avoid infinite loops. The `ingestSpans` function skips writing spans whose `service_name` is `openforge-gateway` and `name` starts with `POST /v1/` (or we simply disable the exporter for those code paths).

#### `apps/web` (Next.js on Node)

- Use `@vercel/otel` + `instrumentation.ts` (the Next.js instrumentation hook).
- Auto-instrumentation covers: incoming HTTP requests, outgoing `fetch()` calls (Forgejo API, sandbox), `pg` queries via Drizzle, `ioredis` commands.
- Custom spans: wrap webhook handlers, CI dispatch, SSE event fan-out.
- Exports telemetry to the gateway (`OTEL_EXPORTER_OTLP_ENDPOINT=http://gateway:4500`).

#### `apps/agent` (Bun worker)

- Call `setupTelemetry({ serviceName: 'openforge-agent' })` at the top of `src/worker.ts`.
- Manual spans for: job processing (`processJob`), agent turns (`runAgentTurn`), LLM API calls, tool executions, sandbox HTTP calls.
- Propagate `traceId` through the job payload so agent traces link to the web app trace that enqueued the job.
- Metrics: `agent.jobs.active` gauge, `agent.job.duration_ms` histogram, `agent.llm.tokens` counter (input/output), `agent.tool.calls` counter by tool name.

#### `apps/ci-runner` (Bun worker)

- Call `setupTelemetry({ serviceName: 'openforge-ci' })` at entrypoint.
- Manual spans for: task execution, git clone, step execution, result callback.
- Metrics: `ci.runs.total` counter, `ci.step.duration_ms` histogram.

#### `packages/sandbox` (Bun HTTP server)

- Call `setupTelemetry({ serviceName: 'openforge-sandbox' })` at the top of `server/server.ts`.
- Manual spans for: incoming tool requests (file read/write, shell exec, grep, git), per-command shell execution.
- Metrics: `sandbox.requests.total` counter, `sandbox.shell.duration_ms` histogram.

### 7. Bun compatibility

The OTel Node SDK (`@opentelemetry/sdk-node`) mostly works on Bun, but auto-instrumentation that patches Node's `http`/`net` modules does not. Strategy:

- **Node services** (`apps/web`): Full auto-instrumentation.
- **Bun services** (`apps/agent`, `apps/ci-runner`, `packages/sandbox`): Use `@opentelemetry/sdk-trace-node` for the trace provider (Bun supports enough of the Node API), but rely on **manual spans** for critical paths rather than `registerInstrumentations`. The `fetch` instrumentation may work since Bun's `fetch` fires global events, but we don't depend on it.
- Test Bun compatibility in CI. If `sdk-trace-node` fails to initialize on Bun, fall back to `sdk-trace-base` with a `SimpleSpanProcessor`.

### 8. Trace context propagation

Traces must flow across service boundaries:

| Boundary | Mechanism |
|----------|-----------|
| Web → Gateway (via HTTP) | Standard W3C `traceparent` header on fetch. If the gateway proxies requests, it propagates the header downstream. |
| Web → Agent (via Redis Streams) | Inject `traceparent` header into the job payload. Agent extracts it when starting the job span. |
| Agent → Sandbox (via HTTP) | Standard W3C `traceparent` header on fetch — sandbox extracts manually. |
| Web → Forgejo (via HTTP) | `traceparent` injected by fetch auto-instrumentation. Forgejo ignores it, but we still get client spans. |
| Web → CI Runner (via Render Workflows) | `traceparent` included in the task params. CI runner extracts on task start. |
| All → Gateway (OTLP export) | Not traced — telemetry export requests are fire-and-forget. The gateway's OTLP receiver does not create child spans from inbound telemetry payloads. |

### 9. Replace `packages/platform/src/observability/metrics.ts`

The existing `MetricsCollector` (originally in `packages/shared`, now in `packages/platform/src/observability/`) is an in-memory stub with no consumers outside `/api/metrics`. Replace it:

1. Change `metrics.counter()` / `metrics.gauge()` / `metrics.histogram()` to delegate to OTel `Meter` instruments.
2. The gateway's `/metrics` endpoint reads from the OTel `MeterProvider`'s in-memory reader (via `@opentelemetry/sdk-metrics` `PeriodicExportingMetricReader` + `InMemoryMetricExporter` combo) or queries `otel_metrics` via SQL.
3. Remove the old `toPrometheus()` method and the Next.js `/api/metrics` route once the gateway endpoint is live.

### 10. Retention and cleanup

Telemetry data grows fast. A scheduled cleanup job prunes old rows:

- **Default retention:** 7 days for spans and logs, 30 days for metrics.
- **Implementation:** A SQL `DELETE FROM otel_spans WHERE start_time < NOW() - INTERVAL '7 days'` wrapped in a periodic function. The gateway runs this on a configurable interval (e.g., every hour) using a simple `setInterval` loop, since it's a long-running process. Alternatively, a Render Cron Job can call a gateway endpoint.
- **Configurable:** `OTEL_RETENTION_SPANS_DAYS`, `OTEL_RETENTION_LOGS_DAYS`, `OTEL_RETENTION_METRICS_DAYS` environment variables.

### 11. Environment variable additions

Added to `.env.example`, `docker-compose.yml`, and `render.yaml`:

```bash
# Telemetry
OTEL_ENABLED=true
OTEL_SERVICE_NAME=openforge-web          # per service
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4500  # gateway base URL in dev
OTEL_INGEST_SECRET=dev-otel-secret   # shared secret for OTLP receiver auth
OTEL_RETENTION_SPANS_DAYS=7
OTEL_RETENTION_LOGS_DAYS=7
OTEL_RETENTION_METRICS_DAYS=30
```

### 12. Docker Compose changes

No new Docker services for telemetry specifically. The gateway (`apps/gateway`) runs locally via `bun run dev` alongside the other services. Each service exports telemetry to `http://localhost:4500/v1/{traces,metrics,logs}`.

If we later want a local Jaeger for the waterfall UI, it's a one-line addition:

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"
```

### 13. Render deployment changes

In `render.yaml`, the gateway is deployed as `openforge-gateway` (web service on Bun). All other services set `OTEL_EXPORTER_OTLP_ENDPOINT` to the gateway's internal URL (`http://openforge-gateway:4500`). The `OTEL_INGEST_SECRET` is generated on `openforge-gateway` and shared to other services via `fromService` references.

## File manifest

| Action | Path | Description |
|--------|------|-------------|
| Create | `packages/telemetry/package.json` | New workspace package for SDK init |
| Create | `packages/telemetry/src/index.ts` | `setupTelemetry`, `getTracer`, `getMeter`, `getLogger` |
| Create | `packages/telemetry/tsconfig.json` | TypeScript config |
| Create | `packages/platform/src/observability/ingest.ts` | `ingestSpans`, `ingestMetrics`, `ingestLogs` — OTLP JSON → Drizzle batch insert |
| Create | `packages/platform/src/observability/retention.ts` | `pruneOldTelemetry` — configurable retention cleanup |
| Create | `apps/gateway/src/routes/telemetry.ts` | Hono routes: `POST /v1/traces`, `/v1/metrics`, `/v1/logs` |
| Create | `apps/gateway/src/routes/health.ts` | Hono route: `GET /health` (aggregated health check) |
| Create | `apps/gateway/src/routes/metrics.ts` | Hono route: `GET /metrics` (Prometheus scrape endpoint) |
| Create | `apps/web/instrumentation.ts` | Next.js instrumentation hook |
| Modify | `packages/db/schema.ts` | Add `otel_spans`, `otel_metrics`, `otel_logs` tables |
| Modify | `packages/platform/src/observability/metrics.ts` | Delegate to OTel Meter API |
| Modify | `packages/platform/src/observability/index.ts` | Re-export ingest + retention functions |
| Modify | `apps/agent/src/worker.ts` | Add `setupTelemetry` call, manual spans |
| Modify | `apps/ci-runner` entrypoint | Add `setupTelemetry` call |
| Modify | `packages/sandbox/server/server.ts` | Add `setupTelemetry` call |
| Modify | `docker-compose.yml` | Add `OTEL_*` env vars to services |
| Modify | `render.yaml` | Add `openforge-gateway` service + `OTEL_*` env vars to all services |
| Modify | `.env.example` | Document new env vars |
| Remove | `apps/web/app/api/metrics/route.ts` | Replaced by gateway `/metrics` |
| Remove | `apps/web/app/api/health/route.ts` | Replaced by gateway `/health` (or kept as thin proxy) |

## Implementation order

1. **Schema** — Add `otel_spans`, `otel_metrics`, `otel_logs` Drizzle tables, run migration.
2. **Platform ingest layer** — `ingestSpans`, `ingestMetrics`, `ingestLogs` in `packages/platform/src/observability/`.
3. **Gateway telemetry routes** — Hono `POST /v1/{traces,metrics,logs}` calling the platform ingest functions.
4. **`packages/telemetry`** — SDK init package with OTLP HTTP exporters pointed at the gateway.
5. **Gateway self-instrumentation** — `setupTelemetry` in the gateway itself (with loop-avoidance).
6. **`apps/web` instrumentation** — `instrumentation.ts` with `@vercel/otel`.
7. **`apps/agent` instrumentation** — Manual spans for job processing, LLM calls, tools.
8. **`apps/ci-runner` + `packages/sandbox`** — Manual spans for remaining services.
9. **Replace MetricsCollector** — Swap to OTel meters, move `/metrics` + `/health` to gateway.
10. **Env vars + config** — `.env.example`, `docker-compose.yml`, `render.yaml`.
11. **Retention job** — Periodic cleanup in the gateway process.
12. **Trace viewer UI** — Lightweight page in the web app to browse traces by service, time, or `run_id`. (Separate follow-up.)
