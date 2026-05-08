# @render-open-forge/ui

Client-side React hooks and utilities shared across the web app. This package contains browser-only code — no server-side logic.

## Hooks

Provided as React context providers with companion consumer hooks:

| Hook | Provider | Purpose |
|------|----------|---------|
| `useExpandedView` | `ExpandedViewProvider` | Toggle expanded/collapsed view state |
| `useReasoningContext` | `ReasoningProvider` | Track LLM thinking/reasoning state (`ThinkingState`) |
| `useTodoView` | `TodoViewProvider` | Manage todo list view state |

## Lib Utilities

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `chat-parts` | `appendStreamEvent`, `AssistantPart` types | Reduce SSE stream events into typed assistant message parts |
| `diff` | `createEditDiffLines`, `createUnifiedDiff`, `getLanguageFromPath` | Build and render code diffs with syntax highlighting support |
| `paste-blocks` | `createPasteToken`, `expandPasteTokens`, `extractPasteTokens` | Tokenize and expand large paste blocks in the editor |
| `tool-state` | `extractRenderState`, `getStatusColor`, `getStatusLabel` | Derive display state from tool call parts |

## Package Exports

```
@render-open-forge/ui            — all hooks and lib re-exports
@render-open-forge/ui/hooks/*    — individual hook files (e.g. hooks/reasoning-context)
@render-open-forge/ui/lib/*      — individual lib files (e.g. lib/diff)
```

## Usage

```tsx
import { ReasoningProvider, useReasoningContext } from "@render-open-forge/ui";
import { createUnifiedDiff } from "@render-open-forge/ui/lib/diff";
```

Peer dependency: **React 18 or 19**.
