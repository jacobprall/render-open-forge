/**
 * CI/CD helpers for Forgejo Actions — commit status reporting
 * and workflow template generation.
 */
import type { ForgejoClient } from "./client";

export interface CommitStatus {
  state: "pending" | "success" | "error" | "failure";
  target_url?: string;
  description?: string;
  context: string;
}

/**
 * Report a commit status back to Forgejo (status checks on PRs / commits).
 */
export async function createCommitStatus(
  client: ForgejoClient,
  owner: string,
  repo: string,
  sha: string,
  status: CommitStatus,
): Promise<Record<string, unknown>> {
  return client.createCommitStatus(owner, repo, sha, status);
}

/**
 * Fetch combined commit status for a ref.
 */
export async function getCombinedStatus(
  client: ForgejoClient,
  owner: string,
  repo: string,
  ref: string,
) {
  return client.getCombinedStatus(owner, repo, ref);
}

/** Common Forgejo Actions workflow templates. */
export const WORKFLOW_TEMPLATES = {
  node: {
    filename: ".forgejo/workflows/ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
`,
  },
  python: {
    filename: ".forgejo/workflows/ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: python -m pytest
`,
  },
  go: {
    filename: ".forgejo/workflows/ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go test ./...
`,
  },
  rust: {
    filename: ".forgejo/workflows/ci.yml",
    content: `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo test
`,
  },
} as const;

export type WorkflowTemplateKey = keyof typeof WORKFLOW_TEMPLATES;

export function getWorkflowTemplate(lang: string): { filename: string; content: string } | null {
  const key = lang.toLowerCase() as WorkflowTemplateKey;
  return WORKFLOW_TEMPLATES[key] ?? null;
}
