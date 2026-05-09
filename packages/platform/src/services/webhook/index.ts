import type { PlatformDb } from "../../interfaces/database";
import type { QueueAdapter } from "../../interfaces/queue";
import type { EventBus } from "../../interfaces/events";
import type { CIService } from "../ci";
import { ForgejoWebhookHandler } from "./forgejo-handler";
import { GitHubWebhookHandler } from "./github-handler";
import { GitLabWebhookHandler } from "./gitlab-handler";

// ---------------------------------------------------------------------------
// WebhookService — thin coordinator that delegates to per-provider handlers
// ---------------------------------------------------------------------------

export class WebhookService {
  private forgejo: ForgejoWebhookHandler;
  private github: GitHubWebhookHandler;
  private gitlab: GitLabWebhookHandler;

  constructor(
    db: PlatformDb,
    queue: QueueAdapter,
    events: EventBus,
    ciService: CIService,
  ) {
    const deps = { db, queue, events, ciService };
    this.forgejo = new ForgejoWebhookHandler(deps);
    this.github = new GitHubWebhookHandler(deps);
    this.gitlab = new GitLabWebhookHandler(deps);
  }

  // Forgejo
  handleForgejoWebhook(rawBody: string, signature: string | null) {
    return this.forgejo.handleForgejoWebhook(rawBody, signature);
  }
  handleForgejoEvent(event: string | null, rawBody: string) {
    return this.forgejo.handleForgejoEvent(event, rawBody);
  }

  // GitHub
  handleGithubWebhook(rawBody: string, signature: string | null) {
    return this.github.handleGithubWebhook(rawBody, signature);
  }
  handleGithubEvent(event: string | null, rawBody: string) {
    return this.github.handleGithubEvent(event, rawBody);
  }

  // GitLab
  handleGitlabWebhook(rawBody: string, token: string | null) {
    return this.gitlab.handleGitlabWebhook(rawBody, token);
  }
  handleGitlabEvent(event: string | null, rawBody: string) {
    return this.gitlab.handleGitlabEvent(event, rawBody);
  }
}
