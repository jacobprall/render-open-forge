/**
 * Typed Forgejo REST API client (internal).
 *
 * This is the low-level HTTP client wrapped by ForgejoProvider.
 * Consumers should use ForgeProvider, not this class directly.
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
  readonly baseUrl: string;
  readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  /**
   * Core HTTP method. Handles auth, JSON parsing, and error reporting.
   * Override `accept` to get non-JSON responses (text, binary).
   */
  async request<T>(
    path: string,
    options: RequestInit & { responseType?: "json" | "text" | "binary" } = {},
  ): Promise<T> {
    const { responseType = "json", ...fetchOpts } = options;
    const url = `${this.baseUrl}/api/v1${path}`;

    const headers: Record<string, string> = {
      Authorization: `token ${this.token}`,
      ...(responseType === "json" ? { "Content-Type": "application/json", Accept: "application/json" } : {}),
    };

    const res = await fetch(url, {
      ...fetchOpts,
      headers: { ...headers, ...(fetchOpts.headers as Record<string, string>) },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Forgejo API ${res.status}: ${res.statusText} - ${body}`);
    }

    if (res.status === 204) return undefined as T;

    if (responseType === "text") return res.text() as Promise<T>;
    if (responseType === "binary") return res.arrayBuffer() as Promise<T>;
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
    return this.request("/user/repos", { method: "POST", body: JSON.stringify(params) });
  }

  async createOrgRepo(org: string, params: CreateRepoParams): Promise<ForgejoRepo> {
    return this.request(`/orgs/${org}/repos`, { method: "POST", body: JSON.stringify(params) });
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    return this.request(`/repos/${owner}/${repo}`, { method: "DELETE" });
  }

  async migrateRepo(params: {
    clone_addr: string;
    repo_name: string;
    repo_owner?: string;
    mirror?: boolean;
    service?: string;
    auth_token?: string;
  }): Promise<ForgejoRepo> {
    return this.request("/repos/migrate", { method: "POST", body: JSON.stringify(params) });
  }

  async forkRepo(owner: string, repo: string, name?: string): Promise<ForgejoRepo> {
    return this.request(`/repos/${owner}/${repo}/fork`, { method: "POST", body: JSON.stringify(name ? { name } : {}) });
  }

  async updateRepo(owner: string, repo: string, patch: Record<string, unknown>): Promise<ForgejoRepo> {
    return this.request(`/repos/${owner}/${repo}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async searchRepos(query: string, limit?: number): Promise<ForgejoRepo[]> {
    return this.request<{ data: ForgejoRepo[] }>(`/repos/search?q=${encodeURIComponent(query)}&limit=${limit ?? 20}`).then(r => r.data ?? (r as unknown as ForgejoRepo[]));
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

  async createOrUpdateFile(
    owner: string, repo: string, path: string,
    content: string, message: string, sha?: string, branch?: string,
  ): Promise<ForgejoFileContent> {
    const payload: Record<string, unknown> = { content: Buffer.from(content, "utf-8").toString("base64"), message };
    if (sha) payload.sha = sha;
    if (branch) payload.branch = branch;
    return this.request(`/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async createFileContent(owner: string, repo: string, path: string, params: { content: string; message: string; branch?: string }): Promise<unknown> {
    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "POST",
      body: JSON.stringify({ content: Buffer.from(params.content, "utf-8").toString("base64"), message: params.message, branch: params.branch }),
    });
  }

  async deleteFileContent(owner: string, repo: string, path: string, params: { message: string; sha: string; branch?: string }): Promise<unknown> {
    return this.request(`/repos/${owner}/${repo}/contents/${path}`, { method: "DELETE", body: JSON.stringify(params) });
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
    return this.request(`/repos/${owner}/${repo}/pulls`, { method: "POST", body: JSON.stringify(body) });
  }

  async listPullRequests(owner: string, repo: string, state?: "open" | "closed" | "all"): Promise<ForgejoPullRequest[]> {
    const params = state ? `?state=${state}` : "";
    return this.request(`/repos/${owner}/${repo}/pulls${params}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ForgejoPullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async mergePullRequest(owner: string, repo: string, number: number, method: "merge" | "rebase" | "squash" = "merge"): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/merge`, { method: "POST", body: JSON.stringify({ Do: method }) });
  }

  async patchPullRequest(owner: string, repo: string, number: number, body: { state?: "open" | "closed"; title?: string }): Promise<ForgejoPullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`, { method: "PATCH", body: JSON.stringify(body) });
  }

  async getPullRequestDiff(owner: string, repo: string, number: number): Promise<string> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}.diff`, { responseType: "text" });
  }

  // --- Reviews & Comments ---

  async createIssueComment(owner: string, repo: string, issueIndex: number, body: string): Promise<{ id: number }> {
    return this.request(`/repos/${owner}/${repo}/issues/${issueIndex}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  }

  async createPullReview(
    owner: string, repo: string, number: number,
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
    body?: string, comments?: Array<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { event };
    if (comments?.length) payload.comments = comments;
    const trimmed = typeof body === "string" ? body.trim() : "";
    if (trimmed.length > 0) {
      payload.body = trimmed;
    } else if (comments?.length) {
      payload.body = "";
    } else if (event !== "APPROVE") {
      payload.body = body ?? "";
    }
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, { method: "POST", body: JSON.stringify(payload) });
  }

  async listPullReviews(owner: string, repo: string, number: number): Promise<Array<Record<string, unknown>>> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`);
  }

  async listPullReviewComments(owner: string, repo: string, number: number): Promise<Array<Record<string, unknown>>> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/comments`);
  }

  async listIssueComments(owner: string, repo: string, issueIndex: number): Promise<Array<Record<string, unknown>>> {
    return this.request(`/repos/${owner}/${repo}/issues/${issueIndex}/comments`);
  }

  async createPullReviewComment(
    owner: string, repo: string, number: number,
    body: string, path: string, newLineNum?: number, oldLineNum?: number,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { body, path };
    if (newLineNum != null) payload.new_position = newLineNum;
    if (oldLineNum != null) payload.old_position = oldLineNum;
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/comments`, { method: "POST", body: JSON.stringify(payload) });
  }

  async resolveReviewComment(owner: string, repo: string, commentId: number): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/pulls/comments/${commentId}/resolve`, { method: "POST" });
  }

  async unresolveReviewComment(owner: string, repo: string, commentId: number): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/pulls/comments/${commentId}/unresolve`, { method: "POST" });
  }

  async requestPullReviewers(owner: string, repo: string, number: number, reviewers: string[]): Promise<unknown> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, { method: "POST", body: JSON.stringify({ reviewers }) });
  }

  // --- CI / Actions ---

  async getActionJobLogs(owner: string, repo: string, jobId: number | string): Promise<string> {
    return this.request(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, { responseType: "text" });
  }

  async setRepoSecret(owner: string, repo: string, name: string, value: string): Promise<void> {
    const data = Buffer.from(value, "utf8").toString("base64");
    return this.request(`/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, {
      method: "PUT", body: JSON.stringify({ data }),
    });
  }

  async listRepoSecrets(owner: string, repo: string): Promise<{ secrets?: { name: string }[] }> {
    return this.request(`/repos/${owner}/${repo}/actions/secrets`);
  }

  async deleteRepoSecret(owner: string, repo: string, name: string): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  async setOrgSecret(org: string, name: string, value: string): Promise<void> {
    const data = Buffer.from(value, "utf8").toString("base64");
    return this.request(`/orgs/${org}/actions/secrets/${encodeURIComponent(name)}`, {
      method: "PUT", body: JSON.stringify({ data }),
    });
  }

  async listOrgSecrets(org: string): Promise<{ secrets?: { name: string }[] }> {
    return this.request(`/orgs/${org}/actions/secrets`);
  }

  async deleteOrgSecret(org: string, name: string): Promise<void> {
    return this.request(`/orgs/${org}/actions/secrets/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  async listActionArtifacts(owner: string, repo: string, runId: string | number): Promise<Array<Record<string, unknown>>> {
    const raw: unknown = await this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
    if (Array.isArray(raw)) return raw as Record<string, unknown>[];
    if (raw && typeof raw === "object") {
      const w = raw as Record<string, unknown>;
      if (Array.isArray(w.artifacts)) return w.artifacts as Record<string, unknown>[];
    }
    return [];
  }

  async downloadArtifact(owner: string, repo: string, artifactId: string | number): Promise<ArrayBuffer> {
    return this.request(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}`, { responseType: "binary" });
  }

  // --- Orgs ---

  async createOrg(login: string, opts?: { full_name?: string; description?: string }): Promise<{ id: number; username: string }> {
    return this.request(`/orgs`, { method: "POST", body: JSON.stringify({ username: login, ...opts }) });
  }

  async deleteOrg(orgName: string): Promise<void> {
    return this.request(`/orgs/${orgName}`, { method: "DELETE" });
  }

  async listOrgMembers(orgName: string): Promise<Array<{ id: number; login: string; avatar_url: string }>> {
    return this.request(`/orgs/${orgName}/members`);
  }

  async addOrgMember(orgName: string, username: string): Promise<void> {
    return this.request(`/orgs/${orgName}/members/${username}`, { method: "PUT" });
  }

  async removeOrgMember(orgName: string, username: string): Promise<void> {
    return this.request(`/orgs/${orgName}/members/${username}`, { method: "DELETE" });
  }

  async listUserOrgs(): Promise<Array<{ id: number; username: string; full_name: string; avatar_url: string; description: string }>> {
    return this.request(`/user/orgs`);
  }

  // --- Branch protections ---

  async listBranchProtections(owner: string, repo: string): Promise<unknown> {
    return this.request(`/repos/${owner}/${repo}/branch_protections`);
  }

  async createBranchProtection(owner: string, repo: string, option: Record<string, unknown>): Promise<unknown> {
    return this.request(`/repos/${owner}/${repo}/branch_protections`, { method: "POST", body: JSON.stringify(option) });
  }

  async deleteBranchProtection(owner: string, repo: string, name: string): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/branch_protections/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  // --- Commit status ---

  async createCommitStatus(owner: string, repo: string, sha: string, status: { state: string; target_url?: string; description?: string; context: string }): Promise<Record<string, unknown>> {
    return this.request(`/repos/${owner}/${repo}/statuses/${sha}`, { method: "POST", body: JSON.stringify(status) });
  }

  async getCombinedStatus(owner: string, repo: string, ref: string): Promise<{ state: string; total_count: number; statuses: Array<Record<string, unknown>> }> {
    return this.request(`/repos/${owner}/${repo}/commits/${ref}/status`);
  }

  // --- Mirror sync ---

  async mirrorSync(owner: string, repo: string): Promise<void> {
    return this.request(`/repos/${owner}/${repo}/mirror-sync`, { method: "POST" });
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
