import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import {
  listPRReviews,
  submitReview,
} from "@render-open-forge/shared/lib/forgejo/review-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  const client = createForgejoClient(auth.forgejoToken);
  try {
    const reviews = await listPRReviews(client, owner, repo, n);
    return NextResponse.json({ reviews });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch reviews" },
      { status: 502 },
    );
  }
}

const REVIEW_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;
type ReviewEvent = (typeof REVIEW_EVENTS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const event = typeof b.event === "string" ? b.event.toUpperCase() : "";
  if (!REVIEW_EVENTS.includes(event as ReviewEvent)) {
    return NextResponse.json({ error: "Invalid event — use APPROVE, REQUEST_CHANGES, or COMMENT" }, { status: 400 });
  }

  const reviewBody = typeof b.body === "string" ? b.body : undefined;
  const comments = Array.isArray(b.comments)
    ? (b.comments as Array<Record<string, unknown>>).map((c) => ({
        path: String(c.path ?? ""),
        body: String(c.body ?? ""),
        new_line_num: typeof c.new_line_num === "number" ? c.new_line_num : undefined,
        old_line_num: typeof c.old_line_num === "number" ? c.old_line_num : undefined,
      }))
    : undefined;

  const client = createForgejoClient(auth.forgejoToken);
  try {
    const review = await submitReview(
      client,
      owner,
      repo,
      n,
      event as ReviewEvent,
      reviewBody,
      comments,
    );
    return NextResponse.json({ review });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to submit review" },
      { status: 502 },
    );
  }
}
