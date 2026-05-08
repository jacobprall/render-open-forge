import type {
  ActiveSkillRef,
  CreateApiKeyResponse,
  CreateInviteResponse,
  CreateMirrorResponse,
  CreateSessionResponse,
  ListApiKeysResponse,
  ListInboxResponse,
  ListInvitesResponse,
  ListMirrorsResponse,
  ListModelsResponse,
  SendMessageResponse,
} from "./types";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = "ApiClientError";
  }
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "ApiClient",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
        error?: unknown;
      };
      throw new ApiClientError(res.status, body.error ?? body);
    }

    return res.json() as Promise<T>;
  }

  // Sessions
  createSession(body: {
    repoPath: string;
    branch: string;
    title?: string;
    activeSkills?: ActiveSkillRef[];
  }) {
    return this.request<CreateSessionResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  sendMessage(sessionId: string, body: { content: string; modelId?: string }) {
    return this.request<SendMessageResponse>(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Mirrors
  listMirrors() {
    return this.request<ListMirrorsResponse>("/api/mirrors");
  }

  createMirror(body: {
    syncConnectionId: string;
    forgejoRepoPath: string;
    remoteRepoUrl: string;
    direction: "pull" | "push" | "bidirectional";
    remoteToken?: string;
    sessionId?: string;
  }) {
    return this.request<CreateMirrorResponse>("/api/mirrors", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Invites
  listInvites() {
    return this.request<ListInvitesResponse>("/api/invites");
  }

  createInvite(body: { username: string; email?: string }) {
    return this.request<CreateInviteResponse>("/api/invites", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Settings — API keys
  listApiKeys() {
    return this.request<ListApiKeysResponse>("/api/settings/api-keys");
  }

  createOrUpdateApiKey(body: {
    provider: "anthropic" | "openai";
    scope: "platform" | "user";
    label?: string;
    apiKey: string;
  }) {
    return this.request<CreateApiKeyResponse>("/api/settings/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Models
  listModels() {
    return this.request<ListModelsResponse>("/api/models");
  }

  // Inbox
  getInbox(params?: { filter?: "unread" | "action_needed" | string; limit?: number; offset?: number }) {
    const sp = new URLSearchParams();
    if (params?.filter != null) sp.set("filter", params.filter);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.offset != null) sp.set("offset", String(params.offset));
    const q = sp.toString();
    const path = q ? `/api/inbox?${q}` : "/api/inbox";
    return this.request<ListInboxResponse>(path);
  }
}

/** Singleton for client components (same-origin). */
export const api = new ApiClient();
