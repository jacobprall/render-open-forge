# UI Specification: render-open-forge

## Pages & Routes

### Public (unauthenticated)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Product pitch + "Sign in with Google" CTA |
| `/shared/[id]` | Shared session | Read-only view of a shared agent session |

### Authenticated (main app shell)

| Route | Page | Description |
|-------|------|-------------|
| `/repos` | Repository list | User's repos + org repos, search/filter, "New" button |
| `/repos/new` | New repository | Create blank repo OR import from GitHub/GitLab |
| `/[owner]/[repo]` | Repo detail | File browser (default branch), README preview |
| `/[owner]/[repo]/tree/[branch]/[...path]` | File/dir browser | Tree view at specific branch + path |
| `/[owner]/[repo]/blob/[branch]/[...path]` | File viewer | Single file with syntax highlighting, blame toggle |
| `/[owner]/[repo]/commits/[branch]` | Commit history | List of commits on a branch |
| `/[owner]/[repo]/commit/[sha]` | Commit detail | Diff view of a single commit |
| `/[owner]/[repo]/pulls` | PR list | Open/closed PRs for the repo |
| `/[owner]/[repo]/pulls/[number]` | PR detail | Conversation + diff + CI status + merge controls |
| `/[owner]/[repo]/pulls/new` | New PR | Branch selector, title/body form |
| `/[owner]/[repo]/actions` | CI runs | List of workflow runs |
| `/[owner]/[repo]/actions/[runId]` | CI run detail | Job steps, logs (streaming) |
| `/[owner]/[repo]/settings` | Repo settings | Branches, webhooks, danger zone |
| `/sessions` | Session list | All agent sessions for the user |
| `/sessions/new` | New session | Pick repo + branch + workflow mode → start agent |
| `/sessions/[id]` | Session detail | Chat + file changes + CI status + PR link |
| `/settings` | User settings | Profile, preferences, connected accounts (sync) |
| `/settings/connections` | Sync connections | Connect GitHub/GitLab for import/export |

---

## Component Decomposition

### Layout Components

```
AppShell
├── Sidebar
│   ├── Logo
│   ├── NavItem (repos, sessions, settings)
│   └── UserMenu (avatar, sign out)
├── TopBar
│   ├── Breadcrumbs
│   ├── BranchSelector (when in repo context)
│   └── ActionButtons (context-dependent)
└── MainContent
```

### Code Browsing Components

```
RepoBrowser
├── FileTree
│   ├── TreeNode (file/dir, expandable)
│   └── TreeNodeIcon (folder, file type icon)
├── FileViewer
│   ├── FileHeader (path, size, actions: raw, blame, edit)
│   ├── CodeBlock (syntax-highlighted, line numbers)
│   └── BlameGutter (optional: commit info per line)
├── BranchSelector
│   ├── BranchDropdown
│   └── BranchSearch
└── CommitHistory
    ├── CommitRow (sha, message, author, date)
    └── CommitDetail (full diff)
```

### Diff & Code Review Components

```
DiffViewer
├── DiffHeader (file path, stats: +N/-M, collapse toggle)
├── DiffHunk
│   ├── HunkHeader (@@ line info @@)
│   ├── DiffLine (addition/deletion/context)
│   │   ├── LineNumber (old, new)
│   │   ├── LineContent (syntax highlighted)
│   │   └── AddCommentButton (hover: + icon)
│   └── InlineComment (thread)
│       ├── CommentBody (markdown rendered)
│       └── ReplyForm
├── DiffModeToggle (unified / split)
└── FileNav (jump between changed files)

PRReview
├── PRHeader (title, status badge, author, timestamps)
├── PRDescription (markdown body)
├── PRTabs (Conversation | Changes | Commits | CI)
├── ConversationTab
│   ├── TimelineEvent (comment, commit, review, status change)
│   └── CommentForm
├── ChangesTab
│   ├── FileList (changed files with stats)
│   └── DiffViewer (per file)
├── CommitsTab
│   └── CommitRow[]
├── CITab
│   └── CIRunStatus[]
└── MergeControls
    ├── MergeButton (merge/squash/rebase dropdown)
    ├── ConflictWarning
    └── BranchDeleteToggle
```

### Agent / Chat Components

```
SessionView
├── SessionHeader (title, repo, branch, status, PR link)
├── ChatPanel
│   ├── MessageList
│   │   ├── UserMessage (text, paste blocks)
│   │   ├── AssistantMessage
│   │   │   ├── TextBlock (markdown)
│   │   │   ├── ToolCallBlock
│   │   │   │   ├── ToolHeader (icon, name, status spinner/check)
│   │   │   │   ├── ToolArgs (collapsible)
│   │   │   │   └── ToolResult (collapsible)
│   │   │   ├── FileChangedBlock
│   │   │   │   ├── FilePath
│   │   │   │   └── MiniDiff (collapsed, expandable)
│   │   │   ├── TaskBlock (subagent: start/done/error)
│   │   │   └── AskUserBlock (question + options)
│   │   └── StreamingIndicator
│   ├── InputArea
│   │   ├── TextInput (multi-line, file drop)
│   │   ├── SendButton
│   │   └── StopButton (during streaming)
│   └── SessionControls
│       ├── WorkflowModeSelector
│       └── PhaseIndicator
├── SidePanel (togglable)
│   ├── FileChanges (list of modified files with diffs)
│   ├── TodoList (agent's task list)
│   └── CIStatus (latest run result)
└── ActionBar
    ├── OpenPRButton
    ├── RunCIButton
    └── ExportUpstreamButton (if synced)
```

### CI Components

```
CIRunList
├── RunRow (workflow name, branch, status badge, duration, timestamp)
└── RunFilters (status, branch, workflow)

CIRunDetail
├── RunHeader (workflow name, trigger, status, duration)
├── JobList
│   └── JobRow (name, status, duration)
└── JobLogs
    ├── StepAccordion (step name, status, duration)
    └── LogStream (ANSI-colored terminal output)
```

### Settings Components

```
SettingsLayout
├── SettingsNav (profile, preferences, connections)
├── ProfileSettings (username, email, avatar)
├── PreferencesSettings
│   ├── DefaultModel selector
│   ├── DiffMode toggle
│   └── WorkflowMode selector
└── ConnectionsSettings
    ├── ConnectionCard (GitHub/GitLab/Bitbucket)
    │   ├── ConnectedState (username, disconnect)
    │   └── DisconnectedState (connect button → OAuth)
    └── ImportRepoFlow
        ├── ProviderRepoList
        └── ImportConfirmation
```

### Common/Shared Components

```
primitives/
├── Button (variants: primary, secondary, ghost, danger)
├── Input (text, search)
├── Select / Dropdown
├── Badge (status: success, failure, pending, etc.)
├── Avatar
├── Tooltip
├── Dialog / Modal
├── Tabs
├── Accordion
├── Skeleton (loading states)
└── EmptyState (illustration + message + action)

code/
├── SyntaxHighlighter (wrapper around shiki or similar)
├── LineNumbers
├── CopyButton
└── LanguageBadge

layout/
├── PageHeader (title, description, actions)
├── Card
├── SplitPane (resizable panels)
└── ScrollArea
```

---

## Design Tokens / Theme

- Dark-first (zinc-950 background, zinc-100 text)
- Accent: emerald-500 for primary actions
- Danger: red-500
- Warning: amber-500
- Success: emerald-500
- Code font: JetBrains Mono or similar monospace
- UI font: Inter or system stack
- Border radius: rounded-lg (8px) for cards, rounded-md (6px) for inputs
- Spacing: 4px grid (Tailwind default)

---

## Data Flow Patterns

### Server Components (default)
- Repo browser, file viewer, commit history, PR list
- Fetch from Forgejo API on the server, render HTML

### Client Components (interactive)
- Chat/streaming (SSE connection)
- Diff viewer (interactive line comments)
- File tree (expand/collapse state)
- Branch selector (search + keyboard nav)
- CI log streaming

### Real-time Updates
- Agent chat: SSE via Redis pub/sub (same as render-open-agents)
- CI status: Poll or SSE for active runs
- PR status: Poll on detail page, webhook updates session state

---

## Priority Order (build sequence)

1. **AppShell + Sidebar + Landing** (navigation works)
2. **Repo list + creation** (core forge loop)
3. **File browser + viewer** (code is visible)
4. **Session creation + chat** (agent works)
5. **Diff viewer** (review code changes)
6. **PR flow** (create, review, merge)
7. **CI status + logs** (pipeline visibility)
8. **Settings + sync connections** (GitHub/GitLab import)
