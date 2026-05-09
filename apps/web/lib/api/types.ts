import type { ModelSummary } from "@/lib/models/anthropic-models";

// ---------------------------------------------------------------------------
// Standard error body (many routes use string `error`; some use `details`)
// ---------------------------------------------------------------------------

export interface ApiErrorResponse {
  error: string | { code: string; message: string; details?: unknown };
}

// ---------------------------------------------------------------------------
// /api/sessions (POST)
// ---------------------------------------------------------------------------

export interface ActiveSkillRef {
  source: "builtin" | "user" | "repo";
  slug: string;
}

export interface CreateSessionResponse {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// /api/sessions/[id]/message (POST)
// ---------------------------------------------------------------------------

export interface SendMessageResponse {
  success: boolean;
  messageId: string;
  runId: string;
}

// ---------------------------------------------------------------------------
// /api/mirrors (GET / POST)
// ---------------------------------------------------------------------------

/** Mirror row as returned in JSON (timestamps serialized). */
export interface MirrorSummary {
  id: string;
  sessionId: string | null;
  syncConnectionId: string;
  localRepoPath: string;
  remoteRepoUrl: string;
  direction: "pull" | "push" | "bidirectional";
  lastSyncAt: string | null;
  status: "active" | "paused" | "error";
  createdAt: string;
}

export interface ListMirrorsResponse {
  mirrors: MirrorSummary[];
  data: MirrorSummary[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface CreateMirrorResponse {
  mirror: MirrorSummary;
}

// ---------------------------------------------------------------------------
// /api/invites (GET / POST)
// ---------------------------------------------------------------------------

export interface CreateInviteResponse {
  inviteUrl: string;
  username: string;
  expiresAt: string;
}

export interface InviteListItem {
  id: string;
  email: string;
  forgejoUsername: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}

export interface ListInvitesResponse {
  invites: InviteListItem[];
  data: InviteListItem[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ---------------------------------------------------------------------------
// /api/settings/api-keys (GET / POST)
// ---------------------------------------------------------------------------

export interface ApiKeyListItem {
  id: string;
  provider: string;
  scope: string;
  label: string;
  keyHint: string;
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListApiKeysResponse {
  encryptionConfigured: boolean;
  isAdmin: boolean;
  envFallback: {
    anthropic: boolean;
    openai: boolean;
  };
  keys: ApiKeyListItem[];
}

export type CreateApiKeyResponse =
  | {
      id: string;
      provider: "anthropic" | "openai";
      scope: "platform" | "user";
      label: string;
      keyHint: string;
      isValid: true;
      updated: true;
    }
  | {
      id: string;
      provider: "anthropic" | "openai";
      scope: "platform" | "user";
      label: string;
      keyHint: string;
      isValid: true;
      createdAt: string;
    };

// ---------------------------------------------------------------------------
// /api/models (GET)
// ---------------------------------------------------------------------------

export interface ListModelsResponse {
  models: ModelSummary[];
}

// ---------------------------------------------------------------------------
// /api/inbox (GET)
// ---------------------------------------------------------------------------

export type PrEventAction =
  | "opened"
  | "closed"
  | "merged"
  | "ci_passed"
  | "ci_failed"
  | "review_requested"
  | "review_submitted"
  | "commented";

/** pr_events row as returned in JSON (timestamps serialized). */
export interface InboxItem {
  id: string;
  userId: string;
  sessionId: string;
  repoPath: string;
  prNumber: number;
  action: PrEventAction;
  title: string | null;
  actionNeeded: boolean;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListInboxResponse {
  items: InboxItem[];
  data: InboxItem[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  total: number;
  hasMore: boolean;
}
