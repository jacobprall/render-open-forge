/**
 * ForgejoProvider — adapts the existing ForgejoClient to the ForgeProvider interface.
 *
 * All Forgejo-specific API shapes are translated into the normalized types here.
 * Consumers never see Forgejo-native types; they work through ForgeProvider.
 */

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
  ForgePushEvent,
  ForgePREvent,
  ForgeReviewCommentEvent,
  ForgeWorkflowRunEvent,
  ForgeStatusEvent,
  ForgeWorkflowTemplate,
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
  ForgeWebhookEventType,
} from "./types";

import type {
  ForgeProvider,
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

import {
  ForgejoClient,
  type ForgejoRepo as NativeRepo,
  type ForgejoPullRequest as NativePR,
  type ForgejoFileContent as NativeFile,
  type ForgejoCommit as NativeCommit,
  type ForgejoBranch as NativeBranch,
} from "../forgejo/client";

import {
  verifyForgejoWebhookSignature,
  isForgejoWebhookVerificationConfigured,
  shouldAllowUnsignedForgejoWebhooks,
} from "../forgejo/webhook-signature";

import { getWorkflowTemplate } from "../forgejo/ci-helpers";

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapRepo(r: NativeRepo): ForgeRepo {
  return {
    id: r.id,
    fullName: r.full_name,
    name: r.name,
    owner: r.owner?.login ?? r.full_name.split("/")[0],
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    cloneUrl: r.clone_url,
    isPrivate: r.private,
    description: r.description ?? "",
  };
}

function mapBranch(b: NativeBranch): ForgeBranch {
  return {
    name: b.name,
    commitSha: b.commit.id,
    commitMessage: b.commit.message,
  };
}

function mapPR(pr: NativePR): ForgePullRequest {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    state: pr.state,
    merged: pr.merged,
    htmlUrl: pr.html_url,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    baseSha: pr.base.sha,
    author: pr.user?.login ?? "unknown",
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  };
}

function mapFileContent(f: NativeFile): ForgeFileContent {
  return {
    name: f.name,
    path: f.path,
    type: f.type,
    content: f.content,
    encoding: f.encoding,
    size: f.size,
    sha: f.sha,
  };
}

function mapCommit(c: NativeCommit): ForgeCommit {
  return {
    sha: c.sha,
    message: c.commit.message,
    authorName: c.commit.author.name,
    authorEmail: c.commit.author.email,
    authorDate: c.commit.author.date,
    htmlUrl: c.html_url,
  };
}

function mapReview(r: Record<string, unknown>): ForgeReview {
  const stateStr = String(r.state ?? "commented").toUpperCase();
  const stateMap: Record<string, ForgeReview["state"]> = {
    APPROVED: "approved",
    REQUEST_CHANGES: "changes_requested",
    CHANGES_REQUESTED: "changes_requested",
    COMMENT: "commented",
    COMMENTED: "commented",
    PENDING: "pending",
    DISMISSED: "dismissed",
  };
  return {
    id: (r.id as number) ?? 0,
    author: ((r.user as Record<string, unknown>)?.login as string) ?? "unknown",
    state: stateMap[stateStr] ?? "commented",
    body: (r.body as string) ?? "",
    submittedAt: (r.submitted_at as string) ?? (r.created_at as string) ?? "",
  };
}

function mapComment(c: Record<string, unknown>): ForgeComment {
  const user = c.user as Record<string, unknown> | undefined;
  return {
    id: (c.id as number) ?? 0,
    author: (user?.login as string) ?? "unknown",
    avatarUrl: (user?.avatar_url as string) ?? "",
    body: (c.body as string) ?? "",
    path: c.path as string | undefined,
    line: c.line as number | undefined,
    oldLine: c.old_position as number | undefined,
    isResolved: c.is_resolved as boolean | undefined,
    createdAt: (c.created_at as string) ?? "",
    updatedAt: (c.updated_at as string) ?? "",
  };
}

// ─── Forgejo Review Event Mapping ────────────────────────────────────────────

const REVIEW_EVENT_MAP: Record<ReviewEvent, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
  approve: "APPROVE",
  request_changes: "REQUEST_CHANGES",
  comment: "COMMENT",
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ForgejoProvider implements ForgeProvider {
  readonly type = "forgejo" as const;
  readonly label = "Forgejo";
  readonly baseUrl: string;

  private client: ForgejoClient;
  private webhookSecret: string;

  repos: RepoOperations;
  files: FileOperations;
  branches: BranchOperations;
  commits: CommitOperations;
  pulls: PullRequestOperations;
  reviews: ReviewOperations;
  ci: CIOperations;
  secrets: RepoSecretOperations;
  orgs: OrgOperations;
  mirrors: MirrorOperations;
  auth: AuthOperations;
  webhooks: WebhookOperations;
  git: GitOperations;

  constructor(baseUrl: string, token: string, webhookSecret?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.webhookSecret = webhookSecret ?? process.env.FORGEJO_WEBHOOK_SECRET ?? "";
    this.client = new ForgejoClient(baseUrl, token);

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

  // ─── Repo ────────────────────────────────────────────────────────────────

  private buildRepoOps(): RepoOperations {
    const c = this.client;
    return {
      async get(owner, repo) {
        return mapRepo(await c.getRepo(owner, repo));
      },
      async list(username) {
        return (await c.listUserRepos(username)).map(mapRepo);
      },
      async create(params) {
        return mapRepo(await c.createRepo({
          name: params.name,
          description: params.description,
          private: params.isPrivate,
          auto_init: params.autoInit,
          default_branch: params.defaultBranch,
        }));
      },
      async createInOrg(org, params) {
        return mapRepo(await c.createOrgRepo(org, {
          name: params.name,
          description: params.description,
          private: params.isPrivate,
          auto_init: params.autoInit,
          default_branch: params.defaultBranch,
        }));
      },
      async delete(owner, repo) {
        await c.deleteRepo(owner, repo);
      },
      async update(owner, repo, patch) {
        return mapRepo(await c.updateRepo(owner, repo, patch));
      },
      async fork(owner, repo, name?) {
        return mapRepo(await c.forkRepo(owner, repo, name));
      },
      async migrate(params) {
        return mapRepo(await c.migrateRepo({
          clone_addr: params.cloneAddr,
          repo_name: params.repoName,
          repo_owner: params.repoOwner,
          mirror: params.mirror,
          service: params.service,
          auth_token: params.authToken,
        }));
      },
      async search(query, limit) {
        return (await c.searchRepos(query, limit)).map(mapRepo);
      },
    };
  }

  // ─── Files ───────────────────────────────────────────────────────────────

  private buildFileOps(): FileOperations {
    const c = this.client;
    return {
      async getContents(owner, repo, path, ref?) {
        const res = await c.getContents(owner, repo, path, ref);
        if (Array.isArray(res)) return res.map(mapFileContent);
        return mapFileContent(res);
      },
      async putFile(owner, repo, path, params) {
        const raw = await c.createOrUpdateFile(owner, repo, path, params.content, params.message, params.sha, params.branch) as unknown;
        return mapFileContent(raw as NativeFile);
      },
      async createFile(owner, repo, path, params) {
        const raw = await c.createFileContent(owner, repo, path, params) as unknown;
        return mapFileContent(raw as NativeFile);
      },
      async deleteFile(owner, repo, path, params) {
        await c.deleteFileContent(owner, repo, path, {
          message: params.message,
          sha: params.sha,
          branch: params.branch,
        });
      },
      async getTree(owner, repo, sha, recursive?) {
        const res = await c.getTree(owner, repo, sha, recursive);
        return res.tree;
      },
    };
  }

  // ─── Branches ────────────────────────────────────────────────────────────

  private buildBranchOps(): BranchOperations {
    const c = this.client;
    return {
      async list(owner, repo) {
        return (await c.listBranches(owner, repo)).map(mapBranch);
      },
      async create(owner, repo, branchName, fromBranch) {
        return mapBranch(await c.createBranch(owner, repo, branchName, fromBranch));
      },
      async listProtectionRules(owner, repo) {
        const raw = await c.listBranchProtections(owner, repo) as Record<string, unknown>[];
        return (Array.isArray(raw) ? raw : []).map(mapBranchProtection);
      },
      async getProtectionRule(owner, repo, branch) {
        const rules = await this.listProtectionRules(owner, repo);
        return rules.find(r => r.pattern === branch) ?? null;
      },
      async setProtectionRule(owner, repo, rule) {
        const payload: Record<string, unknown> = {
          branch_name: rule.pattern,
          rule_name: rule.name ?? rule.pattern,
          enable_approvals_whitelist: (rule.requiredApprovals ?? 0) > 0,
          required_approvals: rule.requiredApprovals ?? 0,
          enable_status_check: rule.requireStatusChecks ?? false,
          status_check_contexts: rule.statusCheckContexts ?? [],
          block_on_official_review_requests: false,
          block_on_outdated_branch: false,
          block_admin_merge_override: false,
          ...(rule.raw ?? {}),
        };
        const existing = await this.getProtectionRule(owner, repo, rule.pattern);
        if (existing) {
          await c.deleteBranchProtection(owner, repo, existing.name);
        }
        const res = await c.createBranchProtection(owner, repo, payload) as Record<string, unknown>;
        return mapBranchProtection(res);
      },
      async deleteProtectionRule(owner, repo, ruleNameOrPattern) {
        await c.deleteBranchProtection(owner, repo, ruleNameOrPattern);
      },
    };
  }

  // ─── Commits ─────────────────────────────────────────────────────────────

  private buildCommitOps(): CommitOperations {
    const c = this.client;
    return {
      async list(owner, repo, opts?) {
        return (await c.listCommits(owner, repo, opts)).map(mapCommit);
      },
      async createStatus(owner, repo, sha, status) {
        await c.createCommitStatus(owner, repo, sha, {
          state: status.state,
          target_url: status.targetUrl,
          description: status.description,
          context: status.context,
        });
      },
      async getCombinedStatus(owner, repo, ref) {
        const raw = await c.getCombinedStatus(owner, repo, ref);
        return {
          state: raw.state,
          totalCount: raw.total_count,
          statuses: (raw.statuses ?? []).map((s: Record<string, unknown>) => ({
            state: s.status as ForgeCommitStatus["state"],
            targetUrl: s.target_url as string | undefined,
            description: s.description as string | undefined,
            context: (s.context as string) ?? "",
          })),
        };
      },
    };
  }

  // ─── Pull Requests ───────────────────────────────────────────────────────

  private buildPullOps(): PullRequestOperations {
    const c = this.client;
    return {
      async list(owner, repo, state?) {
        return (await c.listPullRequests(owner, repo, state)).map(mapPR);
      },
      async get(owner, repo, number) {
        return mapPR(await c.getPullRequest(owner, repo, number));
      },
      async create(params) {
        return mapPR(await c.createPullRequest({
          owner: params.owner,
          repo: params.repo,
          title: params.title,
          body: params.body,
          head: params.head,
          base: params.base,
        }));
      },
      async update(owner, repo, number, patch) {
        return mapPR(await c.patchPullRequest(owner, repo, number, patch));
      },
      async merge(owner, repo, number, method?) {
        await c.mergePullRequest(owner, repo, number, method);
      },
      async diff(owner, repo, number) {
        return c.getPullRequestDiff(owner, repo, number);
      },
    };
  }

  // ─── Reviews ─────────────────────────────────────────────────────────────

  private buildReviewOps(): ReviewOperations {
    const c = this.client;
    return {
      async listReviews(owner, repo, prNumber) {
        const raw = await c.listPullReviews(owner, repo, prNumber);
        return raw.map(mapReview);
      },
      async listComments(owner, repo, prNumber) {
        const reviewComments = await c.listPullReviewComments(owner, repo, prNumber);
        const issueComments = await c.listIssueComments(owner, repo, prNumber);
        return [...reviewComments, ...issueComments].map(mapComment);
      },
      async createComment(owner, repo, issueNumber, body) {
        const raw = await c.createIssueComment(owner, repo, issueNumber, body);
        return {
          id: raw.id,
          author: "self",
          avatarUrl: "",
          body,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async createInlineComment(owner, repo, prNumber, params) {
        const raw = await c.createPullReviewComment(
          owner, repo, prNumber,
          params.body, params.path,
          params.newLine, params.oldLine,
        );
        return mapComment(raw);
      },
      async submitReview(owner, repo, prNumber, event, body?, comments?) {
        const forgejoComments = comments?.map(c => ({
          body: c.body,
          path: c.path,
          new_position: c.newLine,
          old_position: c.oldLine,
        }));
        const raw = await c.createPullReview(
          owner, repo, prNumber,
          REVIEW_EVENT_MAP[event],
          body,
          forgejoComments,
        );
        return mapReview(raw);
      },
      async requestReviewers(owner, repo, prNumber, reviewers) {
        await c.requestPullReviewers(owner, repo, prNumber, reviewers);
      },
      async resolveComment(owner, repo, commentId) {
        await c.resolveReviewComment(owner, repo, commentId as number);
      },
      async unresolveComment(owner, repo, commentId) {
        await c.unresolveReviewComment(owner, repo, commentId as number);
      },
    };
  }

  // ─── CI ──────────────────────────────────────────────────────────────────

  private buildCIOps(): CIOperations {
    const c = this.client;
    return {
      async getJobLogs(owner, repo, jobId) {
        return c.getActionJobLogs(owner, repo, jobId);
      },
      async listArtifacts(owner, repo, runId) {
        const raw = await c.listActionArtifacts(owner, repo, runId);
        return raw.map((a): ForgeArtifact => ({
          id: (a.id as number) ?? 0,
          name: (a.name as string) ?? "unknown",
          sizeBytes: (a.size as number) ?? 0,
          createdAt: a.created_at as string | undefined,
        }));
      },
      async downloadArtifact(owner, repo, artifactId) {
        return c.downloadArtifact(owner, repo, artifactId);
      },
      getWorkflowTemplate(language) {
        const tmpl = getWorkflowTemplate(language);
        if (!tmpl) return null;
        return {
          name: language,
          path: tmpl.filename,
          content: tmpl.content,
        };
      },
    };
  }

  // ─── Secrets ─────────────────────────────────────────────────────────────

  private buildSecretOps(): RepoSecretOperations {
    const c = this.client;
    return {
      async list(owner, repo) {
        const res = await c.listRepoSecrets(owner, repo);
        return (res.secrets ?? []).map(s => s.name);
      },
      async set(owner, repo, name, value) {
        await c.setRepoSecret(owner, repo, name, value);
      },
      async delete(owner, repo, name) {
        await c.deleteRepoSecret(owner, repo, name);
      },
    };
  }

  private buildOrgSecretOps(): OrgSecretOperations {
    const c = this.client;
    return {
      async list(org) {
        const res = await c.listOrgSecrets(org);
        return (res.secrets ?? []).map(s => s.name);
      },
      async set(org, name, value) {
        await c.setOrgSecret(org, name, value);
      },
      async delete(org, name) {
        await c.deleteOrgSecret(org, name);
      },
    };
  }

  // ─── Orgs ────────────────────────────────────────────────────────────────

  private buildOrgOps(): OrgOperations {
    const c = this.client;
    return {
      async list() {
        const raw = await c.listUserOrgs();
        return raw.map((o): ForgeOrg => ({
          id: o.id,
          name: o.username,
          fullName: o.full_name ?? o.username,
          avatarUrl: o.avatar_url ?? "",
          description: o.description ?? "",
        }));
      },
      async create(name, opts?) {
        const raw = await c.createOrg(name, {
          full_name: opts?.fullName,
          description: opts?.description,
        });
        return {
          id: raw.id,
          name: raw.username,
          fullName: opts?.fullName ?? raw.username,
          avatarUrl: "",
          description: opts?.description ?? "",
        };
      },
      async delete(orgName) {
        await c.deleteOrg(orgName);
      },
      async listMembers(orgName) {
        const raw = await c.listOrgMembers(orgName);
        return raw.map((m): ForgeOrgMember => ({
          id: m.id,
          username: m.login,
          avatarUrl: m.avatar_url ?? "",
        }));
      },
      async addMember(orgName, username) {
        await c.addOrgMember(orgName, username);
      },
      async removeMember(orgName, username) {
        await c.removeOrgMember(orgName, username);
      },
      secrets: this.buildOrgSecretOps(),
    };
  }

  // ─── Mirrors ─────────────────────────────────────────────────────────────
  // Forgejo supports push mirrors natively; pull mirrors are done via migrateRepo.
  // This abstraction makes mirror operations forge-agnostic.

  private buildMirrorOps(): MirrorOperations {
    const c = this.client;
    return {
      async setupPushMirror(owner, repo, config) {
        await c.updateRepo(owner, repo, {
          mirror: true,
          push_mirror: {
            remote_address: config.remoteUrl,
            remote_token: config.remoteToken,
            interval: config.interval ?? "8h",
            sync_on_commit: config.syncOnCommit ?? true,
          },
        });
      },
      async setupPullMirror(owner, repo, config) {
        await c.migrateRepo({
          clone_addr: config.remoteUrl,
          repo_name: repo,
          repo_owner: owner,
          mirror: true,
          auth_token: config.remoteToken,
        });
      },
      async sync(owner, repo) {
        try {
          await c.mirrorSync(owner, repo);
          return { success: true };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      async removePushMirror(owner, repo, _remoteUrl) {
        await c.updateRepo(owner, repo, { push_mirror: null });
      },
      async resolveConflict(_owner, _repo, strategy) {
        // Forgejo doesn't have native conflict resolution.
        // This returns the strategy acknowledgment; the caller must
        // orchestrate force-push / rebase / manual resolution.
        return {
          resolved: strategy === "force-push",
          strategy,
          error: strategy === "manual" ? "Manual resolution required" : undefined,
        };
      },
    };
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  private buildAuthOps(): AuthOperations {
    const c = this.client;
    const baseUrl = this.baseUrl;
    return {
      async getAuthenticatedUser() {
        const raw = await c.getAuthenticatedUser();
        return {
          id: raw.id,
          username: raw.login,
          email: raw.email ?? "",
          avatarUrl: raw.avatar_url ?? "",
        };
      },
      async createToken(username, password, tokenName) {
        const res = await fetch(`${baseUrl}/api/v1/users/${username}/tokens`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          },
          body: JSON.stringify({ name: tokenName, scopes: ["all"] }),
        });
        if (!res.ok) {
          throw new Error(`Forgejo token API ${res.status}: ${await res.text()}`);
        }
        const data = await res.json() as { sha1?: string; token?: string };
        return {
          accessToken: data.sha1 ?? data.token ?? "",
        };
      },
      getOAuthAuthorizeUrl(redirectUri, state, scopes?) {
        const clientId = process.env.FORGEJO_CLIENT_ID ?? "";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          state,
        });
        if (scopes?.length) params.set("scope", scopes.join(" "));
        return `${baseUrl}/login/oauth/authorize?${params}`;
      },
      async exchangeOAuthCode(code, redirectUri) {
        const res = await fetch(`${baseUrl}/login/oauth/access_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            client_id: process.env.FORGEJO_CLIENT_ID,
            client_secret: process.env.FORGEJO_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!res.ok) {
          throw new Error(`Forgejo OAuth token exchange ${res.status}`);
        }
        const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        };
      },
    };
  }

  // ─── Webhooks ────────────────────────────────────────────────────────────

  private buildWebhookOps(): WebhookOperations {
    const secret = this.webhookSecret;
    return {
      eventTypeHeader: "x-forgejo-event",
      signatureHeader: "x-forgejo-signature",

      verifySignature(payload, signature) {
        if (!isForgejoWebhookVerificationConfigured()) {
          return shouldAllowUnsignedForgejoWebhooks();
        }
        return verifyForgejoWebhookSignature(
          typeof payload === "string" ? payload : payload.toString("utf8"),
          signature,
          null,
          secret,
        );
      },

      parseEvent(headers, body): ForgeWebhookEvent {
        const eventType = headers["x-forgejo-event"] ?? headers["x-gitea-event"] ?? "";
        const raw = body as Record<string, unknown>;
        const repoObj = raw.repository as Record<string, unknown> | undefined;
        const senderObj = raw.sender as Record<string, unknown> | undefined;

        const base: ForgeWebhookEvent = {
          type: mapForgejoEventType(eventType),
          action: raw.action as string | undefined,
          repo: {
            owner: (repoObj?.owner as Record<string, unknown>)?.login as string ?? "",
            name: (repoObj?.name as string) ?? "",
            fullName: (repoObj?.full_name as string) ?? "",
          },
          sender: (senderObj?.login as string) ?? "",
          raw: body,
        };

        switch (base.type) {
          case "push":
            return parsePushEvent(base, raw);
          case "pull_request":
            return parsePREvent(base, raw);
          case "pull_request_comment":
          case "issue_comment":
            return parseCommentEvent(base, raw);
          case "workflow_run":
            return parseWorkflowEvent(base, raw);
          case "status":
            return parseStatusEvent(base, raw);
          default:
            return base;
        }
      },
    };
  }

  // ─── Git ─────────────────────────────────────────────────────────────────

  private buildGitOps(): GitOperations {
    const c = this.client;
    return {
      authenticatedCloneUrl(owner, repo) {
        return c.authenticatedCloneUrl(owner, repo);
      },
      plainCloneUrl(owner, repo) {
        return c.plainCloneUrl(owner, repo);
      },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapBranchProtection(raw: Record<string, unknown>): BranchProtectionRule {
  return {
    name: (raw.rule_name as string) ?? (raw.branch_name as string) ?? "",
    pattern: (raw.branch_name as string) ?? (raw.rule_name as string) ?? "",
    requiredApprovals: (raw.required_approvals as number) ?? 0,
    requireStatusChecks: Boolean(raw.enable_status_check),
    statusCheckContexts: (raw.status_check_contexts as string[]) ?? [],
    blockForcePush: Boolean(raw.block_on_rejection),
    raw: raw as Record<string, unknown>,
  };
}

function mapForgejoEventType(eventType: string): ForgeWebhookEventType {
  const map: Record<string, ForgeWebhookEventType> = {
    push: "push",
    pull_request: "pull_request",
    pull_request_review: "pull_request_review",
    pull_request_comment: "pull_request_comment",
    issue_comment: "issue_comment",
    workflow_run: "workflow_run",
    status: "status",
  };
  return map[eventType] ?? "unknown";
}

function parsePushEvent(base: ForgeWebhookEvent, raw: Record<string, unknown>): ForgePushEvent {
  const ref = (raw.ref as string) ?? "";
  const commits = (raw.commits as Array<Record<string, unknown>>) ?? [];
  return {
    ...base,
    type: "push",
    ref,
    branch: ref.replace("refs/heads/", ""),
    before: (raw.before as string) ?? "",
    after: (raw.after as string) ?? "",
    commits: commits.map(c => ({
      id: (c.id as string) ?? "",
      message: (c.message as string) ?? "",
      added: (c.added as string[]) ?? [],
      removed: (c.removed as string[]) ?? [],
      modified: (c.modified as string[]) ?? [],
    })),
  };
}

function parsePREvent(base: ForgeWebhookEvent, raw: Record<string, unknown>): ForgePREvent {
  const pr = raw.pull_request as Record<string, unknown>;
  return {
    ...base,
    type: "pull_request",
    action: (raw.action as string) ?? "",
    pullRequest: {
      id: (pr?.id as number) ?? 0,
      number: (pr?.number as number) ?? 0,
      title: (pr?.title as string) ?? "",
      body: (pr?.body as string) ?? "",
      state: (pr?.state as "open" | "closed") ?? "open",
      merged: Boolean(pr?.merged),
      htmlUrl: (pr?.html_url as string) ?? "",
      headRef: ((pr?.head as Record<string, unknown>)?.ref as string) ?? "",
      headSha: ((pr?.head as Record<string, unknown>)?.sha as string) ?? "",
      baseRef: ((pr?.base as Record<string, unknown>)?.ref as string) ?? "",
      baseSha: ((pr?.base as Record<string, unknown>)?.sha as string) ?? "",
      author: ((pr?.user as Record<string, unknown>)?.login as string) ?? "",
      createdAt: (pr?.created_at as string) ?? "",
      updatedAt: (pr?.updated_at as string) ?? "",
    },
  };
}

function parseCommentEvent(base: ForgeWebhookEvent, raw: Record<string, unknown>): ForgeReviewCommentEvent {
  const comment = raw.comment as Record<string, unknown>;
  const user = comment?.user as Record<string, unknown> | undefined;
  const issue = raw.issue as Record<string, unknown> | undefined;
  return {
    ...base,
    type: base.type as "pull_request_comment" | "issue_comment",
    action: (raw.action as string) ?? "",
    comment: {
      id: (comment?.id as number) ?? 0,
      author: (user?.login as string) ?? "",
      avatarUrl: (user?.avatar_url as string) ?? "",
      body: (comment?.body as string) ?? "",
      createdAt: (comment?.created_at as string) ?? "",
      updatedAt: (comment?.updated_at as string) ?? "",
    },
    issueNumber: (issue?.number as number) ?? (raw.number as number) ?? 0,
  };
}

function parseWorkflowEvent(base: ForgeWebhookEvent, raw: Record<string, unknown>): ForgeWorkflowRunEvent {
  const run = raw.workflow_run as Record<string, unknown> | undefined;
  return {
    ...base,
    type: "workflow_run",
    action: (raw.action as string) ?? "",
    workflowName: (run?.name as string) ?? "",
    runId: (run?.id as number) ?? 0,
    conclusion: (run?.conclusion as string) ?? "",
    headBranch: (run?.head_branch as string) ?? "",
    headSha: (run?.head_sha as string) ?? "",
  };
}

function parseStatusEvent(base: ForgeWebhookEvent, raw: Record<string, unknown>): ForgeStatusEvent {
  return {
    ...base,
    type: "status",
    sha: (raw.sha as string) ?? (raw.commit as Record<string, unknown>)?.sha as string ?? "",
    state: (raw.state as string) ?? "",
    context: (raw.context as string) ?? "",
    targetUrl: raw.target_url as string | undefined,
    description: raw.description as string | undefined,
  };
}
