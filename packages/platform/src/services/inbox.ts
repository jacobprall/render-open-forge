import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { prEvents } from "@openforge/db";
import type { PrEvent } from "@openforge/db";
import { ValidationError } from "@openforge/shared";
import type { PlatformDb } from "../interfaces/database";
import type { AuthContext } from "../interfaces/auth";

// ---------------------------------------------------------------------------
// Parameter and result types
// ---------------------------------------------------------------------------

export type InboxFilter = "unread" | "action_needed" | "all";

export interface ListInboxParams {
  filter?: InboxFilter;
  limit: number;
  offset: number;
}

export interface ListInboxResult {
  items: PrEvent[];
  total: number;
  hasMore: boolean;
}

export interface MarkReadParams {
  ids?: string[];
  markAll?: boolean;
}

// ---------------------------------------------------------------------------
// InboxService
// ---------------------------------------------------------------------------

export class InboxService {
  constructor(private db: PlatformDb) {}

  // -------------------------------------------------------------------------
  // list — GET /api/inbox
  // -------------------------------------------------------------------------

  async list(auth: AuthContext, params: ListInboxParams): Promise<ListInboxResult> {
    const { filter = "unread", limit, offset } = params;
    const userId = auth.userId;

    const conditions = [eq(prEvents.userId, userId)];

    if (filter === "unread") {
      conditions.push(eq(prEvents.actionNeeded, true));
      conditions.push(eq(prEvents.read, false));
    } else if (filter === "action_needed") {
      conditions.push(eq(prEvents.actionNeeded, true));
    }

    const whereClause = and(...conditions);

    const [rawItems, [countResult]] = await Promise.all([
      this.db
        .select()
        .from(prEvents)
        .where(whereClause)
        .orderBy(desc(prEvents.createdAt))
        .limit(limit + 1)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(prEvents)
        .where(whereClause),
    ]);

    const hasMore = rawItems.length > limit;
    const items = hasMore ? rawItems.slice(0, limit) : rawItems;

    return {
      items,
      total: countResult?.count ?? 0,
      hasMore,
    };
  }

  // -------------------------------------------------------------------------
  // countUnread — GET /api/inbox/count
  // -------------------------------------------------------------------------

  async countUnread(auth: AuthContext): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(prEvents)
      .where(
        and(
          eq(prEvents.userId, auth.userId),
          eq(prEvents.actionNeeded, true),
          eq(prEvents.read, false),
        ),
      );

    return result?.count ?? 0;
  }

  // -------------------------------------------------------------------------
  // dismiss — POST /api/inbox/dismiss
  // -------------------------------------------------------------------------

  async dismiss(auth: AuthContext, ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError("ids array required");
    }

    await this.db
      .update(prEvents)
      .set({ actionNeeded: false, read: true })
      .where(and(eq(prEvents.userId, auth.userId), inArray(prEvents.id, ids)));
  }

  // -------------------------------------------------------------------------
  // markRead — POST /api/inbox/read
  // -------------------------------------------------------------------------

  async markRead(auth: AuthContext, params: MarkReadParams): Promise<void> {
    const { ids, markAll } = params;

    if (!markAll && (!Array.isArray(ids) || ids.length === 0)) {
      throw new ValidationError("ids array or markAll required");
    }

    if (markAll) {
      await this.db
        .update(prEvents)
        .set({ read: true })
        .where(and(eq(prEvents.userId, auth.userId), eq(prEvents.read, false)));
    } else {
      await this.db
        .update(prEvents)
        .set({ read: true })
        .where(and(eq(prEvents.userId, auth.userId), inArray(prEvents.id, ids!)));
    }
  }
}
