/**
 * BaseForgeProvider — optional abstract base for ForgeProvider adapters.
 *
 * Centralizes property declarations, baseUrl normalization, and shared utilities.
 * Adapters extend this class and implement the operation-building methods.
 */

import type { ReviewEvent } from "./types";

import type {
  ForgeProvider,
  ForgeProviderType,
  RepoOperations,
  FileOperations,
  BranchOperations,
  CommitOperations,
  PullRequestOperations,
  ReviewOperations,
  CIOperations,
  RepoSecretOperations,
  OrgOperations,
  MirrorOperations,
  AuthOperations,
  WebhookOperations,
  GitOperations,
} from "./provider";

export abstract class BaseForgeProvider implements ForgeProvider {
  abstract readonly type: ForgeProviderType;
  abstract readonly label: string;
  readonly baseUrl: string;

  repos!: RepoOperations;
  files!: FileOperations;
  branches!: BranchOperations;
  commits!: CommitOperations;
  pulls!: PullRequestOperations;
  reviews!: ReviewOperations;
  ci!: CIOperations;
  secrets!: RepoSecretOperations;
  orgs!: OrgOperations;
  mirrors!: MirrorOperations;
  auth!: AuthOperations;
  webhooks!: WebhookOperations;
  git!: GitOperations;

  /** Maps normalized ReviewEvent values to the uppercase strings expected by forge APIs. */
  static readonly REVIEW_EVENT_MAP: Record<ReviewEvent, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
    approve: "APPROVE",
    request_changes: "REQUEST_CHANGES",
    comment: "COMMENT",
  };

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Build a typed JSON API helper bound to a base URL and auth token.
   * Useful for adapters that make direct HTTP calls (e.g. GitHub).
   */
  protected static makeApiHelper(
    baseUrl: string,
    token: string,
    authHeaderFormat: string = "token {token}",
    options: {
      defaultHeaders?: Record<string, string>;
      errorPrefix?: string;
    } = {},
  ) {
    const authValue = authHeaderFormat.replace("{token}", token);
    const defaults = options.defaultHeaders ?? {};
    const prefix = options.errorPrefix ?? "API";

    return async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: authValue,
          "Content-Type": "application/json",
          ...defaults,
          ...init.headers,
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${prefix} ${res.status}: ${res.statusText} - ${body}`);
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    };
  }
}
