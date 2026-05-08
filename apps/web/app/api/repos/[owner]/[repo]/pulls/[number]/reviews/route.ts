import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";
import type { ReviewEvent } from "@render-open-forge/platform";

const REVIEW_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;
const EVENT_MAP: Record<string, ReviewEvent> = {
  APPROVE: "approve",
  REQUEST_CHANGES: "request_changes",
  COMMENT: "comment",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  try {
    const reviews = await getPlatform().pullRequests.listReviews(auth, owner, repo, n);
    return NextResponse.json({ reviews });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch reviews" },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const rawEvent = typeof b.event === "string" ? b.event.toUpperCase() : "";
  if (!REVIEW_EVENTS.includes(rawEvent as (typeof REVIEW_EVENTS)[number])) {
    return NextResponse.json({ error: "Invalid event — use APPROVE, REQUEST_CHANGES, or COMMENT" }, { status: 400 });
  }

  const event = EVENT_MAP[rawEvent]!;
  const reviewBody = typeof b.body === "string" ? b.body : undefined;
  const comments = Array.isArray(b.comments)
    ? (b.comments as Array<Record<string, unknown>>).map((c) => ({
        body: String(c.body ?? ""),
        path: String(c.path ?? ""),
        newLine: typeof c.new_line_num === "number" ? c.new_line_num : undefined,
        oldLine: typeof c.old_line_num === "number" ? c.old_line_num : undefined,
      }))
    : undefined;

  try {
    const review = await getPlatform().pullRequests.submitReview(auth, owner, repo, n, {
      event,
      body: reviewBody,
      comments,
    });
    return NextResponse.json({ review });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to submit review" },
      { status: 502 },
    );
  }
}
