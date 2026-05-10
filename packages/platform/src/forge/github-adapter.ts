/**
 * GitHubProvider — adapts the GitHub REST API to the ForgeProvider interface.
 */

import crypto from "node:crypto";

import type {
  ForgeRepo,
  ForgeBranch,
  ForgePullRequest,
  ForgeFileContent,
  ForgeCommit,
  ForgeReview,
  ForgeComment,
  ForgeUser,
  ForgeOrg,
  ForgeOrgMember,
  ForgeArtifact,
  ForgeCommitStatus,
  ForgeCombinedStatus,
  ForgeTokenResult,
  ForgeWebhookEvent,
  ForgeWorkflowTemplate,
  ForgePushEvent,
  ForgePREvent,
  ForgeReviewCommentEvent,
  ForgeWorkflowRunEvent,
  ForgeStatusEvent,
  MirrorConfig,
  MirrorSyncResult,
  MirrorConflictResult,
  BranchProtectionRule,
  CreateRepoParams,
  CreatePRParams,
  PutFileParams,
  DeleteFileParams,
  MigrateRepoParams,
  InlineCommentParams,
  ReviewEvent,
  MergeMethod,
  ConflictStrategy,
} from "./types";

import type {
  RepoOperations,
  FileOperations,
  BranchOperations,
  CommitOperations,
  PullRequestOperations,
  ReviewOperations,
  CIOperations,
  RepoSecretOperations,
  OrgSecretOperations,
  OrgOperations,
  MirrorOperations,
  AuthOperations,
  WebhookOperations,
  GitOperations,
} from "./provider";

import { BaseForgeProvider } from "./base-provider";
import { mapReviewState, mapPushCommits, mapWebhookBaseEvent } from "./shared-mappers";

function notImplemented(op: string): never {
  throw new Error(`GitHubProvider: ${op} not yet implemented`);
}

export class GitHubProvider extends BaseForgeProvider {
  readonly type = "github" as const;
  readonly label = "GitHub";

  private token: string;
  private webhookSecret: string;

  constructor(baseUrl: string, token: string, webhookSecret?: string) {
    super(baseUrl);
    this.token = token;
    this.webhookSecret = webhookSecret ?? process.env.GITHUB_WEBHOOK_SECRET ?? "";

    this.repos = this.buildRepoOps();
    this.files = this.buildFileOps();
    this.branches = this.buildBranchOps();
    this.commits = this.buildCommitOps();
    this.pulls = this.buildPullOps();
    this.reviews = this.buildReviewOps();
    this.ci = this.buildCIOps();
    this.secrets = this.buildSecretOps();
    this.orgs = this.buildOrgOps();
    this.mirrors = this.buildMirrorOps();
    this.auth = this.buildAuthOps();
    this.webhooks = this.buildWebhookOps();
    this.git = this.buildGitOps();
  }

  // ─── API helpers ──────────────────────────────────────────────────────────

  /** Repo-scoped API helper — prepends /repos to all paths. */
  private async api<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    return this.apiGeneric<T>(`/repos${path}`, options);
  }

  /** Generic API helper — uses the path as-is without any prefix. */
  private async apiGeneric<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${res.statusText} - ${body}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** Raw API call that returns text instead of JSON (e.g. for diffs). */
  private async apiRaw(
    path: string,
    options: RequestInit = {},
  ): Promise<string> {
    const url = `${this.baseUrl}/repos${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `token ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${res.statusText} - ${body}`);
    }
    return res.text();
  }

  // ─── Repos ────────────────────────────────────────────────────────────────

  private buildRepoOps(): RepoOperations {
    return {
      get: async (owner: string, repo: string): Promise<ForgeRepo> => {
        const raw = await this.api<Record<string, unknown>>(`/${owner}/${repo}`);
        return this.mapRepo(raw);
      },

      list: async (): Promise<ForgeRepo[]> => {
        const raw = await this.apiGeneric<Record<string, unknown>[]>(
          "/user/repos?sort=updated&per_page=100",
        );
        return raw.map((r) => this.mapRepo(r));
      },

      create: async (params: CreateRepoParams): Promise<ForgeRepo> => {
        const raw = await this.apiGeneric<Record<string, unknown>>("/user/repos", {
          method: "POST",
          body: JSON.stringify({
            name: params.name,
            description: params.description ?? "",
            private: params.isPrivate ?? false,
            auto_init: params.autoInit ?? false,
            default_branch: params.defaultBranch,
          }),
        });
        return this.mapRepo(raw);
      },

      createInOrg: () => notImplemented("repos.createInOrg"),

      delete: async (owner: string, repo: string): Promise<void> => {
        await this.api<void>(`/${owner}/${repo}`, { method: "DELETE" });
      },

      update: () => notImplemented("repos.update"),
      fork: () => notImplemented("repos.fork"),
      migrate: () => notImplemented("repos.migrate"),

      search: async (query: string, limit?: number): Promise<ForgeRepo[]> => {
        const perPage = limit ?? 30;
        const raw = await this.apiGeneric<{ items: Record<string, unknown>[] }>(
          `/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}`,
        );
        return raw.items.map((r) => this.mapRepo(r));
      },
    };
  }

  private mapRepo(raw: Record<string, unknown>): ForgeRepo {
    const owner = raw.owner as Record<string, unknown> | undefined;
    return {
      id: raw.id as number,
      fullName: (raw.full_name as string) ?? "",
      name: (raw.name as string) ?? "",
      owner: (owner?.login as string) ?? "",
      defaultBranch: (raw.default_branch as string) ?? "main",
      htmlUrl: (raw.html_url as string) ?? "",
      cloneUrl: (raw.clone_url as string) ?? "",
      isPrivate: (raw.private as boolean) ?? false,
      description: (raw.description as string) ?? "",
    };
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  private buildFileOps(): FileOperations {
    return {
      getContents: async (
        owner: string,
        repo: string,
        path: string,
        ref?: string,
      ): Promise<ForgeFileContent | ForgeFileContent[]> => {
        const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
        const raw = await this.api<Record<string, unknown> | Record<string, unknown>[]>(
          `/${owner}/${repo}/contents/${path}${query}`,
        );
        if (Array.isArray(raw)) {
          return raw.map((item) => this.mapFileContent(item));
        }
        return this.mapFileContent(raw);
      },

      putFile: async (
        owner: string,
        repo: string,
        path: string,
        params: PutFileParams,
      ): Promise<ForgeFileContent> => {
        const raw = await this.api<{ content: Record<string, unknown> }>(
          `/${owner}/${repo}/contents/${path}`,
          {
            method: "PUT",
            body: JSON.stringify({
              message: params.message,
              content: params.content,
              sha: params.sha,
              branch: params.branch,
            }),
          },
        );
        return this.mapFileContent(raw.content);
      },

      createFile: async (
        owner: string,
        repo: string,
        path: string,
        params: { content: string; message: string; branch?: string },
      ): Promise<ForgeFileContent> => {
        const raw = await this.api<{ content: Record<string, unknown> }>(
          `/${owner}/${repo}/contents/${path}`,
          {
            method: "PUT",
            body: JSON.stringify({
              message: params.message,
              content: params.content,
              branch: params.branch,
            }),
          },
        );
        return this.mapFileContent(raw.content);
      },

      deleteFile: async (
        owner: string,
        repo: string,
        path: string,
        params: DeleteFileParams,
      ): Promise<void> => {
        await this.api<void>(`/${owner}/${repo}/contents/${path}`, {
          method: "DELETE",
          body: JSON.stringify({
            message: params.message,
            sha: params.sha,
            branch: params.branch,
          }),
        });
      },

      getTree: () => notImplemented("files.getTree"),
    };
  }

  private mapFileContent(raw: Record<string, unknown>): ForgeFileContent {
    return {
      name: (raw.name as string) ?? "",
      path: (raw.path as string) ?? "",
      type: (raw.type as "file" | "dir" | "symlink" | "submodule") ?? "file",
      content: raw.content as string | undefined,
      encoding: raw.encoding as string | undefined,
      size: (raw.size as number) ?? 0,
      sha: (raw.sha as string) ?? "",
    };
  }

  // ─── Branches ─────────────────────────────────────────────────────────────

  private buildBranchOps(): BranchOperations {
    return {
      list: async (owner: string, repo: string): Promise<ForgeBranch[]> => {
        const raw = await this.api<Record<string, unknown>[]>(
          `/${owner}/${repo}/branches`,
        );
        return raw.map((b) => {
          const commit = b.commit as Record<string, unknown> | undefined;
          const commitDetail = commit?.commit as Record<string, unknown> | undefined;
          return {
            name: (b.name as string) ?? "",
            commitSha: (commit?.sha as string) ?? "",
            commitMessage: (commitDetail?.message as string) ?? "",
          };
        });
      },

      create: async (
        owner: string,
        repo: string,
        branchName: string,
        fromBranch: string,
      ): Promise<ForgeBranch> => {
        // fromBranch may be a branch name or SHA — resolve to SHA via the branch API first
        let sha = fromBranch;
        if (!/^[0-9a-f]{40}$/i.test(fromBranch)) {
          const branchData = await this.api<Record<string, unknown>>(
            `/${owner}/${repo}/branches/${encodeURIComponent(fromBranch)}`,
          );
          const commit = branchData.commit as Record<string, unknown> | undefined;
          sha = (commit?.sha as string) ?? fromBranch;
        }

        const raw = await this.api<Record<string, unknown>>(
          `/${owner}/${repo}/git/refs`,
          {
            method: "POST",
            body: JSON.stringify({
              ref: `refs/heads/${branchName}`,
              sha,
            }),
          },
        );
        const obj = raw.object as Record<string, unknown> | undefined;
        return {
          name: branchName,
          commitSha: (obj?.sha as string) ?? sha,
          commitMessage: "",
        };
      },

      listProtectionRules: () => notImplemented("branches.listProtectionRules"),
      getProtectionRule: () => notImplemented("branches.getProtectionRule"),
      setProtectionRule: () => notImplemented("branches.setProtectionRule"),
      deleteProtectionRule: () => notImplemented("branches.deleteProtectionRule"),
    };
  }

  // ─── Commits ──────────────────────────────────────────────────────────────

  private buildCommitOps(): CommitOperations {
    return {
      list: async (
        owner: string,
        repo: string,
        opts?: { sha?: string; limit?: number },
      ): Promise<ForgeCommit[]> => {
        const params = new URLSearchParams();
        if (opts?.sha) params.set("sha", opts.sha);
        if (opts?.limit) params.set("per_page", String(opts.limit));
        const query = params.toString() ? `?${params.toString()}` : "";
        const raw = await this.api<Record<string, unknown>[]>(
          `/${owner}/${repo}/commits${query}`,
        );
        return raw.map((c) => {
          const commit = c.commit as Record<string, unknown> | undefined;
          const author = commit?.author as Record<string, unknown> | undefined;
          return {
            sha: (c.sha as string) ?? "",
            message: (commit?.message as string) ?? "",
            authorName: (author?.name as string) ?? "",
            authorEmail: (author?.email as string) ?? "",
            authorDate: (author?.date as string) ?? "",
            htmlUrl: (c.html_url as string) ?? "",
          };
        });
      },

      createStatus: async (
        owner: string,
        repo: string,
        sha: string,
        status: ForgeCommitStatus,
      ): Promise<void> => {
        await this.api<void>(`/${owner}/${repo}/statuses/${sha}`, {
          method: "POST",
          body: JSON.stringify({
            state: status.state,
            target_url: status.targetUrl,
            description: status.description,
            context: status.context,
          }),
        });
      },

      getCombinedStatus: async (
        owner: string,
        repo: string,
        ref: string,
      ): Promise<ForgeCombinedStatus> => {
        const raw = await this.api<Record<string, unknown>>(
          `/${owner}/${repo}/commits/${ref}/status`,
        );
        const statuses = (raw.statuses as Record<string, unknown>[]) ?? [];
        return {
          state: (raw.state as string) ?? "pending",
          totalCount: (raw.total_count as number) ?? statuses.length,
          statuses: statuses.map((s) => ({
            state: s.state as "pending" | "success" | "failure" | "error",
            targetUrl: s.target_url as string | undefined,
            description: s.description as string | undefined,
            context: (s.context as string) ?? "",
          })),
        };
      },

      getDiff: async (owner: string, repo: string, sha: string): Promise<string> => {
        try {
          return await this.apiRaw(`/${owner}/${repo}/commits/${sha}`, {
            headers: {
              Accept: "application/vnd.github.v3.diff",
            },
          });
        } catch {
          return "";
        }
      },
    };
  }

  // ─── Pulls ────────────────────────────────────────────────────────────────

  private buildPullOps(): PullRequestOperations {
    return {
      list: async (
        owner: string,
        repo: string,
        state?: "open" | "closed" | "all",
      ): Promise<ForgePullRequest[]> => {
        const query = state ? `?state=${state}` : "";
        const raw = await this.api<Record<string, unknown>[]>(
          `/${owner}/${repo}/pulls${query}`,
        );
        return raw.map((pr) => this.mapPullRequest(pr));
      },

      get: async (
        owner: string,
        repo: string,
        number: number,
      ): Promise<ForgePullRequest> => {
        const raw = await this.api<Record<string, unknown>>(
          `/${owner}/${repo}/pulls/${number}`,
        );
        return this.mapPullRequest(raw);
      },

      create: async (params: CreatePRParams): Promise<ForgePullRequest> => {
        const raw = await this.api<Record<string, unknown>>(
          `/${params.owner}/${params.repo}/pulls`,
          {
            method: "POST",
            body: JSON.stringify({
              title: params.title,
              body: params.body ?? "",
              head: params.head,
              base: params.base,
            }),
          },
        );
        return this.mapPullRequest(raw);
      },

      update: async (
        owner: string,
        repo: string,
        number: number,
        patch: { state?: "open" | "closed"; title?: string },
      ): Promise<ForgePullRequest> => {
        const raw = await this.api<Record<string, unknown>>(
          `/${owner}/${repo}/pulls/${number}`,
          {
            method: "PATCH",
            body: JSON.stringify(patch),
          },
        );
        return this.mapPullRequest(raw);
      },

      merge: async (
        owner: string,
        repo: string,
        number: number,
        method?: MergeMethod,
      ): Promise<void> => {
        await this.api<void>(`/${owner}/${repo}/pulls/${number}/merge`, {
          method: "PUT",
          body: JSON.stringify({
            merge_method: method ?? "merge",
          }),
        });
      },

      diff: async (
        owner: string,
        repo: string,
        number: number,
      ): Promise<string> => {
        return this.apiRaw(`/${owner}/${repo}/pulls/${number}`, {
          headers: {
            Accept: "application/vnd.github.diff",
          },
        });
      },
    };
  }

  private mapPullRequest(raw: Record<string, unknown>): ForgePullRequest {
    const head = raw.head as Record<string, unknown> | undefined;
    const base = raw.base as Record<string, unknown> | undefined;
    const user = raw.user as Record<string, unknown> | undefined;

    return {
      id: raw.id as number,
      number: raw.number as number,
      title: (raw.title as string) ?? "",
      body: (raw.body as string) ?? "",
      state: (raw.state as string) === "open" ? "open" : "closed",
      merged: (raw.merged as boolean) ?? false,
      htmlUrl: (raw.html_url as string) ?? "",
      headRef: (head?.ref as string) ?? "",
      headSha: (head?.sha as string) ?? "",
      baseRef: (base?.ref as string) ?? "",
      baseSha: (base?.sha as string) ?? "",
      author: (user?.login as string) ?? "",
      createdAt: (raw.created_at as string) ?? "",
      updatedAt: (raw.updated_at as string) ?? "",
    };
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────

  private buildReviewOps(): ReviewOperations {
    return {
      listReviews: async (
        owner: string,
        repo: string,
        prNumber: number,
      ): Promise<ForgeReview[]> => {
        const raw = await this.api<Record<string, unknown>[]>(
          `/${owner}/${repo}/pulls/${prNumber}/reviews`,
        );
        return raw.map((r) => {
          const user = r.user as Record<string, unknown> | undefined;
          return {
            id: r.id as number,
            author: (user?.login as string) ?? "",
            state: mapReviewState(r.state as string),
            body: (r.body as string) ?? "",
            submittedAt: (r.submitted_at as string) ?? "",
          };
        });
      },

      listComments: async (
        owner: string,
        repo: string,
        prNumber: number,
      ): Promise<ForgeComment[]> => {
        const raw = await this.api<Record<string, unknown>[]>(
          `/${owner}/${repo}/pulls/${prNumber}/comments`,
        );
        return raw.map((c) => this.mapComment(c));
      },

      createComment: async (
        owner: string,
        repo: string,
        issueNumber: number,
        body: string,
      ): Promise<ForgeComment> => {
        const raw = await this.api<Record<string, unknown>>(
          `/${owner}/${repo}/issues/${issueNumber}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body }),
          },
        );
        return this.mapComment(raw);
      },

      createInlineComment: () => notImplemented("reviews.createInlineComment"),

      submitReview: async (
        owner: string,
        repo: string,
        prNumber: number,
        event: ReviewEvent,
        body?: string,
        comments?: InlineCommentParams[],
      ): Promise<ForgeReview> => {
        const payload: Record<string, unknown> = {
          event: BaseForgeProvider.REVIEW_EVENT_MAP[event],
        };
        if (body) payload.body = body;
        if (comments?.length) {
          payload.comments = comments.map((c) => ({
            path: c.path,
            body: c.body,
            line: c.newLine,
          }));
        }
        const raw = await this.api<Record<string, unknown>>(
          `/${owner}/${repo}/pulls/${prNumber}/reviews`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        const user = raw.user as Record<string, unknown> | undefined;
        return {
          id: raw.id as number,
          author: (user?.login as string) ?? "",
          state: mapReviewState(raw.state as string),
          body: (raw.body as string) ?? "",
          submittedAt: (raw.submitted_at as string) ?? "",
        };
      },

      requestReviewers: async (
        owner: string,
        repo: string,
        prNumber: number,
        reviewers: string[],
      ): Promise<void> => {
        await this.api<void>(
          `/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
          {
            method: "POST",
            body: JSON.stringify({ reviewers }),
          },
        );
      },

      resolveComment: () => notImplemented("reviews.resolveComment"),
      unresolveComment: () => notImplemented("reviews.unresolveComment"),
    };
  }

  private mapComment(raw: Record<string, unknown>): ForgeComment {
    const user = raw.user as Record<string, unknown> | undefined;
    return {
      id: raw.id as number,
      author: (user?.login as string) ?? "",
      avatarUrl: (user?.avatar_url as string) ?? "",
      body: (raw.body as string) ?? "",
      path: raw.path as string | undefined,
      line: raw.line as number | undefined,
      oldLine: raw.original_line as number | undefined,
      isResolved: undefined,
      createdAt: (raw.created_at as string) ?? "",
      updatedAt: (raw.updated_at as string) ?? "",
    };
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  private buildAuthOps(): AuthOperations {
    return {
      getAuthenticatedUser: async (): Promise<ForgeUser> => {
        const raw = await this.apiGeneric<Record<string, unknown>>("/user");
        return {
          id: raw.id as number,
          username: (raw.login as string) ?? "",
          email: (raw.email as string) ?? "",
          avatarUrl: (raw.avatar_url as string) ?? "",
        };
      },
    };
  }

  // ─── Webhooks ─────────────────────────────────────────────────────────────

  private buildWebhookOps(): WebhookOperations {
    const secret = this.webhookSecret;
    return {
      eventTypeHeader: "X-GitHub-Event",
      signatureHeader: "X-Hub-Signature-256",

      verifySignature(payload: string | Buffer, signature: string | null): boolean {
        if (!secret) return true;
        if (!signature) return false;

        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(typeof payload === "string" ? payload : payload);
        const expected = `sha256=${hmac.digest("hex")}`;

        const sigBuf = Buffer.from(signature);
        const expectedBuf = Buffer.from(expected);
        if (sigBuf.length !== expectedBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expectedBuf);
      },

      parseEvent(
        headers: Record<string, string | undefined>,
        body: unknown,
      ): ForgeWebhookEvent {
        const eventType = headers["x-github-event"] ?? headers["X-GitHub-Event"] ?? "unknown";
        const raw = body as Record<string, unknown>;
        const baseEvent = mapWebhookBaseEvent(body);

        switch (eventType) {
          case "push": {
            const ref = (raw.ref as string) ?? "";
            const branch = ref.replace("refs/heads/", "");
            const commits = (raw.commits as Record<string, unknown>[]) ?? [];
            return {
              ...baseEvent,
              type: "push",
              ref,
              branch,
              before: (raw.before as string) ?? "",
              after: (raw.after as string) ?? "",
              commits: mapPushCommits(commits),
            } as ForgePushEvent;
          }

          case "pull_request": {
            const action = (raw.action as string) ?? "";
            const pr = raw.pull_request as Record<string, unknown> | undefined;
            const head = pr?.head as Record<string, unknown> | undefined;
            const base = pr?.base as Record<string, unknown> | undefined;
            const prUser = pr?.user as Record<string, unknown> | undefined;
            return {
              ...baseEvent,
              type: "pull_request",
              action,
              pullRequest: {
                id: (pr?.id as number) ?? 0,
                number: (pr?.number as number) ?? 0,
                title: (pr?.title as string) ?? "",
                body: (pr?.body as string) ?? "",
                state: (pr?.state as string) === "open" ? "open" : "closed",
                merged: (pr?.merged as boolean) ?? false,
                htmlUrl: (pr?.html_url as string) ?? "",
                headRef: (head?.ref as string) ?? "",
                headSha: (head?.sha as string) ?? "",
                baseRef: (base?.ref as string) ?? "",
                baseSha: (base?.sha as string) ?? "",
                author: (prUser?.login as string) ?? "",
                createdAt: (pr?.created_at as string) ?? "",
                updatedAt: (pr?.updated_at as string) ?? "",
              },
            } as ForgePREvent;
          }

          case "pull_request_review_comment":
          case "issue_comment": {
            const action = (raw.action as string) ?? "";
            const comment = raw.comment as Record<string, unknown> | undefined;
            const commentUser = comment?.user as Record<string, unknown> | undefined;
            const issue = raw.issue as Record<string, unknown> | undefined;
            const prData = raw.pull_request as Record<string, unknown> | undefined;
            const issueNumber = (issue?.number as number) ?? (prData?.number as number) ?? 0;
            return {
              ...baseEvent,
              type: eventType === "issue_comment" ? "issue_comment" : "pull_request_comment",
              action,
              comment: {
                id: (comment?.id as number) ?? 0,
                author: (commentUser?.login as string) ?? "",
                avatarUrl: (commentUser?.avatar_url as string) ?? "",
                body: (comment?.body as string) ?? "",
                path: comment?.path as string | undefined,
                line: comment?.line as number | undefined,
                oldLine: comment?.original_line as number | undefined,
                createdAt: (comment?.created_at as string) ?? "",
                updatedAt: (comment?.updated_at as string) ?? "",
              },
              issueNumber,
            } as ForgeReviewCommentEvent;
          }

          case "workflow_run": {
            const action = (raw.action as string) ?? "";
            const wf = raw.workflow_run as Record<string, unknown> | undefined;
            return {
              ...baseEvent,
              type: "workflow_run",
              action,
              workflowName: (wf?.name as string) ?? "",
              runId: (wf?.id as number) ?? 0,
              conclusion: (wf?.conclusion as string) ?? "",
              headBranch: (wf?.head_branch as string) ?? "",
              headSha: (wf?.head_sha as string) ?? "",
            } as ForgeWorkflowRunEvent;
          }

          case "status": {
            return {
              ...baseEvent,
              type: "status",
              sha: (raw.sha as string) ?? "",
              state: (raw.state as string) ?? "",
              context: (raw.context as string) ?? "",
              targetUrl: raw.target_url as string | undefined,
              description: raw.description as string | undefined,
            } as ForgeStatusEvent;
          }

          default:
            return {
              ...baseEvent,
              type: "unknown",
              action: raw.action as string | undefined,
            };
        }
      },
    };
  }

  // ─── Git ──────────────────────────────────────────────────────────────────

  private buildGitOps(): GitOperations {
    const token = this.token;
    // Derive the web host from the API base URL (api.github.com -> github.com, GHE stays as-is)
    const apiHost = new URL(this.baseUrl).hostname;
    const webHost = apiHost === "api.github.com" ? "github.com" : apiHost;
    return {
      authenticatedCloneUrl(owner: string, repo: string): string {
        return `https://x-access-token:${token}@${webHost}/${owner}/${repo}.git`;
      },
      plainCloneUrl(owner: string, repo: string): string {
        return `https://${webHost}/${owner}/${repo}.git`;
      },
    };
  }

  // ─── Stubs (not yet needed) ───────────────────────────────────────────────

  private buildCIOps(): CIOperations {
    return {
      getJobLogs: () => notImplemented("ci.getJobLogs"),
      listArtifacts: () => notImplemented("ci.listArtifacts"),
      downloadArtifact: () => notImplemented("ci.downloadArtifact"),
      getWorkflowTemplate: () => null,
    };
  }

  private buildSecretOps(): RepoSecretOperations {
    return {
      list: () => notImplemented("secrets.list"),
      set: () => notImplemented("secrets.set"),
      delete: () => notImplemented("secrets.delete"),
    };
  }

  private buildOrgOps(): OrgOperations {
    return {
      list: () => notImplemented("orgs.list"),
      create: () => notImplemented("orgs.create"),
      delete: () => notImplemented("orgs.delete"),
      listMembers: () => notImplemented("orgs.listMembers"),
      addMember: () => notImplemented("orgs.addMember"),
      removeMember: () => notImplemented("orgs.removeMember"),
      secrets: {
        list: () => notImplemented("orgs.secrets.list"),
        set: () => notImplemented("orgs.secrets.set"),
        delete: () => notImplemented("orgs.secrets.delete"),
      },
    };
  }

  private buildMirrorOps(): MirrorOperations {
    return {
      setupPushMirror: () => notImplemented("mirrors.setupPushMirror"),
      setupPullMirror: () => notImplemented("mirrors.setupPullMirror"),
      sync: () => notImplemented("mirrors.sync"),
      removePushMirror: () => notImplemented("mirrors.removePushMirror"),
      resolveConflict: () => notImplemented("mirrors.resolveConflict"),
    };
  }
}
