/**
 * Typed Forgejo REST API client.
 *
 * Talks to the internal Forgejo instance. Used by both the web app
 * (with user OAuth tokens) and the agent worker (with service account token).
 */

export interface ForgejoRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  html_url: string;
  clone_url: string;
  private: boolean;
  description: string;
}

export interface ForgejoBranch {
  name: string;
  commit: { id: string; message: string };
}

export interface ForgejoPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  merged: boolean;
  html_url: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  user: { login: string };
  created_at: string;
  updated_at: string;
}

export interface ForgejoFileContent {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  content?: string;
  encoding?: string;
  size: number;
  sha: string;
}

export interface ForgejoCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  html_url: string;
}

export interface CreatePrParams {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
}

export interface CreateRepoParams {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  default_branch?: string;
}

export class ForgejoClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `token ${this.token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Forgejo API ${res.status}: ${res.statusText} - ${body}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // --- Auth ---

  async getAuthenticatedUser(): Promise<{ id: number; login: string; email: string; avatar_url: string }> {
    return this.request("/user");
  }

  // --- Repos ---

  async listUserRepos(username?: string): Promise<ForgejoRepo[]> {
    const path = username ? `/users/${username}/repos` : "/user/repos";
    return this.request<ForgejoRepo[]>(`${path}?limit=50`);
  }

  async getRepo(owner: string, repo: string): Promise<ForgejoRepo> {
    return this.request(`/repos/${owner}/${repo}`);
  }

  async createRepo(params: CreateRepoParams): Promise<ForgejoRepo> {
    return this.request("/user/repos", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async createOrgRepo(org: string, params: CreateRepoParams): Promise<ForgejoRepo> {
    return this.request(`/orgs/${org}/repos`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    return this.request(`/repos/${owner}/${repo}`, { method: "DELETE" });
  }

  // --- Branches ---

  async listBranches(owner: string, repo: string): Promise<ForgejoBranch[]> {
    return this.request(`/repos/${owner}/${repo}/branches`);
  }

  async createBranch(owner: string, repo: string, branchName: string, oldBranch: string): Promise<ForgejoBranch> {
    return this.request(`/repos/${owner}/${repo}/branches`, {
      method: "POST",
      body: JSON.stringify({ new_branch_name: branchName, old_branch_name: oldBranch }),
    });
  }

  // --- Files ---

  async getContents(owner: string, repo: string, path: string, ref?: string): Promise<ForgejoFileContent | ForgejoFileContent[]> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return this.request(`/repos/${owner}/${repo}/contents/${path}${params}`);
  }

  async getTree(owner: string, repo: string, sha: string, recursive?: boolean): Promise<{ tree: Array<{ path: string; type: string; sha: string; size?: number }> }> {
    const params = recursive ? "?recursive=true" : "";
    return this.request(`/repos/${owner}/${repo}/git/trees/${sha}${params}`);
  }

  // --- Commits ---

  async listCommits(owner: string, repo: string, opts?: { sha?: string; limit?: number }): Promise<ForgejoCommit[]> {
    const params = new URLSearchParams();
    if (opts?.sha) params.set("sha", opts.sha);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/repos/${owner}/${repo}/git/commits${query}`);
  }

  // --- Pull Requests ---

  async createPullRequest(params: CreatePrParams): Promise<ForgejoPullRequest> {
    const { owner, repo, ...body } = params;
    return this.request(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async listPullRequests(owner: string, repo: string, state?: "open" | "closed" | "all"): Promise<ForgejoPullRequest[]> {
    const params = state ? `?state=${state}` : "";
    return this.request(`/repos/${owner}/${repo}/pulls${params}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ForgejoPullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async mergePullRequest(owner: string, repo: string, number: number, method: "merge" | "rebase" | "squash" = "merge"): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
      method: "POST",
      body: JSON.stringify({ Do: method }),
    });
  }

  // --- Clone URL helpers ---

  authenticatedCloneUrl(owner: string, repo: string): string {
    const url = new URL(this.baseUrl);
    return `${url.protocol}//agent:${this.token}@${url.host}/${owner}/${repo}.git`;
  }

  plainCloneUrl(owner: string, repo: string): string {
    return `${this.baseUrl}/${owner}/${repo}.git`;
  }
}
