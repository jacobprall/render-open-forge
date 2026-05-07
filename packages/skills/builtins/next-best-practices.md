---
name: Next.js Best Practices
description: Next.js best practices from Vercel — file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/font optimization, bundling, hydration errors, suspense, parallel routes, self-hosting.
---

# Next.js Best Practices

Apply these rules when writing or reviewing Next.js code.

## File Conventions

- Use special files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`.
- Route segments: `[param]` (dynamic), `[...slug]` (catch-all), `(group)` (route groups).
- Parallel routes via `@slot` folders; intercepting routes via `(.)`, `(..)`, `(...)`.

## RSC Boundaries

- Server Components are async by default — never mark a client component as async.
- Props passed from Server to Client components must be serializable (no functions, Dates, etc.).
- Server Actions are the exception — they can be passed as props.
- Add `'use client'` only at the boundary, not on every component.

## Async Patterns (Next.js 15+)

- `params` and `searchParams` are now async — `await` them in page/layout components.
- `cookies()` and `headers()` are async — use `await cookies()`.
- Run the migration codemod: `npx @next/codemod@canary next-async-request-api .`

## Data Patterns

- Fetch data in Server Components when possible — no client-side waterfalls.
- Use `Promise.all` or Suspense boundaries to avoid sequential waterfalls.
- Server Actions for mutations; Route Handlers for webhooks/external APIs.
- Preload patterns: call `fetch` early in the component tree.

## Error Handling

- `error.tsx` catches errors within a route segment (must be a client component).
- `global-error.tsx` catches root layout errors.
- `not-found.tsx` for 404s; trigger with `notFound()`.
- Use `unstable_rethrow` in catch blocks that might swallow Next.js internal errors.

## Route Handlers

- Export named functions: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Cannot coexist with `page.tsx` in the same route segment.
- No React DOM available — don't import React components.

## Image & Font Optimization

- Always use `next/image` over `<img>` — handles lazy loading, sizing, formats.
- Configure `remotePatterns` for external image domains.
- Use `next/font` for zero-layout-shift font loading.

## Bundling

- Mark server-only packages with `server-only` to prevent client bundle inclusion.
- Use CSS imports, not `<link>` tags.
- Analyze bundles with `@next/bundle-analyzer`.

## Hydration Errors

- Common causes: browser-only APIs in render, `Date.now()`, invalid HTML nesting.
- Fix: move browser APIs to `useEffect`, use `suppressHydrationWarning` for dates.

## Suspense Boundaries

- `useSearchParams` and certain hooks cause CSR bailout — wrap in `<Suspense>`.
- Place Suspense boundaries strategically for streaming.

## Self-Hosting

- Set `output: 'standalone'` for Docker deployments.
- Configure external cache handlers for multi-instance ISR.
