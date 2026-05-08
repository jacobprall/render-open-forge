/**
 * GitHubProvider — adapts the GitHub REST API to the ForgeProvider interface.
 *
 * Currently implements the subset needed for upstream mirror operations:
 * git clone URLs and pull request creation. Other operations throw
 * "not implemented" and can be filled in as needed.
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

function notImplemented(op: string): never {
  throw new Error(`GitHubProvider: ${op} not yet implemented`);
}

export class GitHubProvider implements ForgeProvider {
  readonly type = "github" as const;
  readonly label = "GitHub";
  readonly baseUrl: string;

  private token: string;

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

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;

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

  // ─── API helper ─────────────────────────────────────────────────────────

  private async api<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/repos${path}`;
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

  // ─── Pulls (implemented) ────────────────────────────────────────────────

  private buildPullOps(): PullRequestOperations {
    return {
      list: () => notImplemented("pulls.list"),
      get: () => notImplemented("pulls.get"),

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
          headRef: (head?.ref as string) ?? params.head,
          headSha: (head?.sha as string) ?? "",
          baseRef: (base?.ref as string) ?? params.base,
          baseSha: (base?.sha as string) ?? "",
          author: (user?.login as string) ?? "",
          createdAt: (raw.created_at as string) ?? "",
          updatedAt: (raw.updated_at as string) ?? "",
        };
      },

      update: () => notImplemented("pulls.update"),
      merge: () => notImplemented("pulls.merge"),
      diff: () => notImplemented("pulls.diff"),
    };
  }

  // ─── Git (implemented) ──────────────────────────────────────────────────

  private buildGitOps(): GitOperations {
    const token = this.token;
    return {
      authenticatedCloneUrl(owner: string, repo: string): string {
        return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
      },
      plainCloneUrl(owner: string, repo: string): string {
        return `https://github.com/${owner}/${repo}.git`;
      },
    };
  }

  // ─── Stubs (not yet needed for upstream mirror operations) ──────────────

  private buildRepoOps(): RepoOperations {
    return {
      get: () => notImplemented("repos.get"),
      list: () => notImplemented("repos.list"),
      create: () => notImplemented("repos.create"),
      createInOrg: () => notImplemented("repos.createInOrg"),
      delete: () => notImplemented("repos.delete"),
      update: () => notImplemented("repos.update"),
      fork: () => notImplemented("repos.fork"),
      migrate: () => notImplemented("repos.migrate"),
      search: () => notImplemented("repos.search"),
    };
  }

  private buildFileOps(): FileOperations {
    return {
      getContents: () => notImplemented("files.getContents"),
      putFile: () => notImplemented("files.putFile"),
      createFile: () => notImplemented("files.createFile"),
      deleteFile: () => notImplemented("files.deleteFile"),
      getTree: () => notImplemented("files.getTree"),
    };
  }

  private buildBranchOps(): BranchOperations {
    return {
      list: () => notImplemented("branches.list"),
      create: () => notImplemented("branches.create"),
      listProtectionRules: () => notImplemented("branches.listProtectionRules"),
      getProtectionRule: () => notImplemented("branches.getProtectionRule"),
      setProtectionRule: () => notImplemented("branches.setProtectionRule"),
      deleteProtectionRule: () => notImplemented("branches.deleteProtectionRule"),
    };
  }

  private buildCommitOps(): CommitOperations {
    return {
      list: () => notImplemented("commits.list"),
      createStatus: () => notImplemented("commits.createStatus"),
      getCombinedStatus: () => notImplemented("commits.getCombinedStatus"),
    };
  }

  private buildReviewOps(): ReviewOperations {
    return {
      listReviews: () => notImplemented("reviews.listReviews"),
      listComments: () => notImplemented("reviews.listComments"),
      createComment: () => notImplemented("reviews.createComment"),
      createInlineComment: () => notImplemented("reviews.createInlineComment"),
      submitReview: () => notImplemented("reviews.submitReview"),
      requestReviewers: () => notImplemented("reviews.requestReviewers"),
      resolveComment: () => notImplemented("reviews.resolveComment"),
      unresolveComment: () => notImplemented("reviews.unresolveComment"),
    };
  }

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

  private buildAuthOps(): AuthOperations {
    return {
      getAuthenticatedUser: () => notImplemented("auth.getAuthenticatedUser"),
    };
  }

  private buildWebhookOps(): WebhookOperations {
    return {
      verifySignature: () => false,
      parseEvent: () => notImplemented("webhooks.parseEvent"),
      eventTypeHeader: "X-GitHub-Event",
      signatureHeader: "X-Hub-Signature-256",
    };
  }
}
