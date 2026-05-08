/**
 * Composition root: wires all platform services together.
 *
 * Each host (Next.js app, Hono gateway, agent worker, tests) creates one
 * `PlatformContainer` on startup and passes individual services to the code
 * that needs them. This file is the single place where dependency graphs
 * are resolved — consumers never `new` a service directly.
 */

import type Redis from "ioredis";
import type { PlatformDb } from "./interfaces/database";
import { createDb } from "./interfaces/database";
import { RedisQueueAdapter, type QueueAdapter } from "./interfaces/queue";
import { RedisEventBus, type EventBus } from "./interfaces/events";
import type { StorageAdapter } from "./interfaces/storage";
import type { CacheAdapter } from "./interfaces/cache";
import { RedisCacheAdapter } from "./interfaces/cache";
import type { CIDispatcher } from "./interfaces/ci-dispatcher";
import { RenderWorkflowsDispatcher, LocalCIDispatcher } from "./interfaces/ci-dispatcher";
import type { NotificationSink } from "./interfaces/notification-sink";
import { ConsoleSink } from "./interfaces/notification-sink";
import type { AuthProvider } from "./interfaces/auth-provider";

import { SessionService } from "./services/session";
import { RepoService } from "./services/repo";
import { PullRequestService } from "./services/pull-request";
import { OrgService } from "./services/org";
import { InboxService } from "./services/inbox";
import { SettingsService } from "./services/settings";
import { SkillService } from "./services/skill";
import { ModelService } from "./services/model";
import { NotificationService } from "./services/notification";
import { InviteService } from "./services/invite";
import { MirrorService } from "./services/mirror";
import { CIService } from "./services/ci";
import { WebhookService } from "./services/webhook";

// ---------------------------------------------------------------------------
// Container config
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  /** Postgres connection string. */
  databaseUrl: string;
  /** Postgres pool options. */
  dbPool?: { maxConnections?: number; idleTimeout?: number };
  /** ioredis instance (shared across queue + events + cache). */
  redis: Redis;
  /** Optional pre-built adapters. Defaults are created from redis when omitted. */
  storage?: StorageAdapter;
  cache?: CacheAdapter;
  ciDispatcher?: CIDispatcher;
  notificationSink?: NotificationSink;
  authProvider?: AuthProvider;
}

// ---------------------------------------------------------------------------
// PlatformContainer
// ---------------------------------------------------------------------------

export interface PlatformContainer {
  // Infrastructure
  db: PlatformDb;
  queue: QueueAdapter;
  events: EventBus;
  cache: CacheAdapter;
  storage: StorageAdapter | undefined;
  ciDispatcher: CIDispatcher;
  notificationSink: NotificationSink;
  authProvider: AuthProvider | undefined;

  // Domain services
  sessions: SessionService;
  repos: RepoService;
  pullRequests: PullRequestService;
  orgs: OrgService;
  inbox: InboxService;
  settings: SettingsService;
  skills: SkillService;
  models: ModelService;
  notifications: NotificationService;
  invites: InviteService;
  mirrors: MirrorService;
  ci: CIService;
  webhooks: WebhookService;
}

/**
 * Build the full service graph. Call once at startup.
 *
 * ```ts
 * import Redis from "ioredis";
 * import { createPlatform } from "@openforge/platform/container";
 *
 * const platform = createPlatform({
 *   databaseUrl: process.env.DATABASE_URL!,
 *   redis: new Redis(process.env.REDIS_URL!),
 * });
 *
 * // Use in a route handler:
 * const { sessionId } = await platform.sessions.create(auth, params);
 * ```
 */
export function createPlatform(config: PlatformConfig): PlatformContainer {
  const db = createDb(config.databaseUrl, config.dbPool);
  const queue: QueueAdapter = new RedisQueueAdapter(config.redis);
  const events: EventBus = new RedisEventBus(config.redis);
  const cache: CacheAdapter = config.cache ?? new RedisCacheAdapter(config.redis);
  const ciDispatcher: CIDispatcher = config.ciDispatcher ?? defaultCIDispatcher();
  const notificationSink: NotificationSink = config.notificationSink ?? new ConsoleSink();
  return buildContainer(db, queue, events, cache, config.storage, ciDispatcher, notificationSink, config.authProvider);
}

// ---------------------------------------------------------------------------
// Pre-built instances variant
// ---------------------------------------------------------------------------

export interface PlatformInstances {
  db: PlatformDb;
  redis: Redis;
  storage?: StorageAdapter;
  cache?: CacheAdapter;
  ciDispatcher?: CIDispatcher;
  notificationSink?: NotificationSink;
  authProvider?: AuthProvider;
}

/**
 * Same as {@link createPlatform} but accepts an already-constructed `db` and
 * Redis. Useful when the host (e.g. Next.js) owns connection lifecycle.
 */
export function createPlatformFromInstances(inst: PlatformInstances): PlatformContainer {
  const queue: QueueAdapter = new RedisQueueAdapter(inst.redis);
  const events: EventBus = new RedisEventBus(inst.redis);
  const cache: CacheAdapter = inst.cache ?? new RedisCacheAdapter(inst.redis);
  const ciDispatcher: CIDispatcher = inst.ciDispatcher ?? defaultCIDispatcher();
  const notificationSink: NotificationSink = inst.notificationSink ?? new ConsoleSink();
  return buildContainer(inst.db, queue, events, cache, inst.storage, ciDispatcher, notificationSink, inst.authProvider);
}

// ---------------------------------------------------------------------------
// CI dispatcher selection
// ---------------------------------------------------------------------------

function defaultCIDispatcher(): CIDispatcher {
  if (process.env.CI_RUNNER_MODE === "local") {
    return new LocalCIDispatcher();
  }
  return new RenderWorkflowsDispatcher();
}

// ---------------------------------------------------------------------------
// Internal wiring
// ---------------------------------------------------------------------------

function buildContainer(
  db: PlatformDb,
  queue: QueueAdapter,
  events: EventBus,
  cache: CacheAdapter,
  storage: StorageAdapter | undefined,
  ciDispatcher: CIDispatcher,
  notificationSink: NotificationSink,
  authProvider: AuthProvider | undefined,
): PlatformContainer {
  const sessions = new SessionService(db, queue, events);
  const repos = new RepoService(db);
  const pullRequests = new PullRequestService();
  const orgs = new OrgService(db);
  const inbox = new InboxService(db);
  const settings = new SettingsService(db);
  const skills = new SkillService();
  const models = new ModelService(db);
  const notifications = new NotificationService(db);
  const invites = new InviteService(db);
  const mirrors = new MirrorService(db);
  const ci = new CIService(db, queue, events, ciDispatcher);
  const webhooks = new WebhookService(db, queue, events, ci);

  return {
    db,
    queue,
    events,
    cache,
    storage,
    ciDispatcher,
    notificationSink,
    authProvider,
    sessions,
    repos,
    pullRequests,
    orgs,
    inbox,
    settings,
    skills,
    models,
    notifications,
    invites,
    mirrors,
    ci,
    webhooks,
  };
}
