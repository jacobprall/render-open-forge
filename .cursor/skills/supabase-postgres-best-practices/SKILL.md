---
name: supabase-postgres-best-practices
description: Postgres performance optimization and best practices from Supabase — query indexing, connection management, RLS security, schema design, locking, data access patterns, monitoring, and advanced features. Use when writing SQL, designing schemas, optimizing queries, configuring Postgres, working with RLS, or troubleshooting database performance.
---

# Supabase Postgres Best Practices

From [supabase/agent-skills](https://github.com/supabase/agent-skills). Comprehensive performance optimization guide for Postgres, maintained by Supabase.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Reference Files |
|----------|----------|--------|-----------------|
| 1 | Query Performance | CRITICAL | See [references/query-missing-indexes.md](references/query-missing-indexes.md), [query-partial-indexes](references/query-partial-indexes.md), [query-composite-indexes](references/query-composite-indexes.md), [query-covering-indexes](references/query-covering-indexes.md), [query-index-types](references/query-index-types.md) |
| 2 | Connection Management | CRITICAL | See [references/conn-pooling.md](references/conn-pooling.md), [conn-limits](references/conn-limits.md), [conn-idle-timeout](references/conn-idle-timeout.md), [conn-prepared-statements](references/conn-prepared-statements.md) |
| 3 | Security & RLS | CRITICAL | See [references/security-rls-basics.md](references/security-rls-basics.md), [security-rls-performance](references/security-rls-performance.md), [security-privileges](references/security-privileges.md) |
| 4 | Schema Design | HIGH | See [references/schema-data-types.md](references/schema-data-types.md), [schema-constraints](references/schema-constraints.md), [schema-primary-keys](references/schema-primary-keys.md), [schema-foreign-key-indexes](references/schema-foreign-key-indexes.md), [schema-lowercase-identifiers](references/schema-lowercase-identifiers.md), [schema-partitioning](references/schema-partitioning.md) |
| 5 | Concurrency & Locking | MEDIUM-HIGH | See [references/lock-short-transactions.md](references/lock-short-transactions.md), [lock-deadlock-prevention](references/lock-deadlock-prevention.md), [lock-advisory](references/lock-advisory.md), [lock-skip-locked](references/lock-skip-locked.md) |
| 6 | Data Access Patterns | MEDIUM | See [references/data-pagination.md](references/data-pagination.md), [data-batch-inserts](references/data-batch-inserts.md), [data-n-plus-one](references/data-n-plus-one.md), [data-upsert](references/data-upsert.md) |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | See [references/monitor-explain-analyze.md](references/monitor-explain-analyze.md), [monitor-pg-stat-statements](references/monitor-pg-stat-statements.md), [monitor-vacuum-analyze](references/monitor-vacuum-analyze.md) |
| 8 | Advanced Features | LOW | See [references/advanced-full-text-search.md](references/advanced-full-text-search.md), [advanced-jsonb-indexing](references/advanced-jsonb-indexing.md) |

## How to Use

Read individual reference files for detailed explanations and SQL examples. Each contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Supabase-specific notes (when applicable)

For the full section index, see [references/_sections.md](references/_sections.md).
