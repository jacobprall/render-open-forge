/**
 * Shared mapping utilities used by both Forgejo and GitHub forge adapters.
 *
 * These are pure transformation functions with no forge-specific dependencies.
 * Each adapter imports only the helpers it needs.
 */

import type {
  ForgeReview,
  ForgeWebhookEvent,
  ForgePushEvent,
} from "./types";

// ─── Review State Normalization ─────────────────────────────────────────────

const REVIEW_STATE_MAP: Record<string, ForgeReview["state"]> = {
  APPROVED: "approved",
  REQUEST_CHANGES: "changes_requested",
  CHANGES_REQUESTED: "changes_requested",
  COMMENT: "commented",
  COMMENTED: "commented",
  PENDING: "pending",
  DISMISSED: "dismissed",
};

/**
 * Normalize a review state string into the canonical ForgeReview state.
 * Handles both GitHub-style (APPROVED, CHANGES_REQUESTED) and Forgejo-style
 * (REQUEST_CHANGES, COMMENT) variants.
 */
export function mapReviewState(stateStr: string): ForgeReview["state"] {
  return REVIEW_STATE_MAP[stateStr?.toUpperCase()] ?? "commented";
}

// ─── Webhook Helpers ────────────────────────────────────────────────────────

/**
 * Extract the common base fields from a webhook payload.
 * Both GitHub and Forgejo webhooks use the same `repository` and `sender` structure.
 */
export function mapWebhookBaseEvent(body: unknown): {
  repo: ForgeWebhookEvent["repo"];
  sender: string;
  raw: unknown;
} {
  const raw = body as Record<string, unknown>;
  const repoData = raw.repository as Record<string, unknown> | undefined;
  const owner = repoData?.owner as Record<string, unknown> | undefined;
  const sender = raw.sender as Record<string, unknown> | undefined;

  return {
    repo: {
      owner: (owner?.login as string) ?? "",
      name: (repoData?.name as string) ?? "",
      fullName: (repoData?.full_name as string) ?? "",
    },
    sender: (sender?.login as string) ?? "",
    raw: body,
  };
}

/**
 * Map raw push-event commit objects into the normalized commit shape.
 * The commit structure is identical across GitHub and Forgejo webhooks.
 */
export function mapPushCommits(
  commits: Record<string, unknown>[],
): ForgePushEvent["commits"] {
  return commits.map((c) => ({
    id: (c.id as string) ?? "",
    message: (c.message as string) ?? "",
    added: (c.added as string[]) ?? [],
    removed: (c.removed as string[]) ?? [],
    modified: (c.modified as string[]) ?? [],
  }));
}
