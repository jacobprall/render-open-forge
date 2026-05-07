import { NextRequest, NextResponse } from "next/server";

/**
 * Receives webhooks from the internal Forgejo instance.
 *
 * Events we handle:
 * - Workflow run completed (CI pass/fail) → update session CI status, trigger agent fix on failure
 * - Pull request events → update session PR status
 * - Push events → sync mirrors if configured
 */
export async function POST(request: NextRequest) {
  const event = request.headers.get("x-forgejo-event");
  const body = await request.json();

  switch (event) {
    case "workflow_run": {
      await handleWorkflowRun(body);
      break;
    }
    case "pull_request": {
      await handlePullRequest(body);
      break;
    }
    case "push": {
      // Future: trigger mirror sync
      break;
    }
    default: {
      console.log(`[webhook] Unhandled Forgejo event: ${event}`);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleWorkflowRun(payload: unknown) {
  // TODO: Parse workflow run payload
  // If conclusion === "failure" and session has auto-fix enabled:
  //   1. Record ci_event
  //   2. Enqueue agent fix job via Redis
  console.log("[webhook] workflow_run received");
}

async function handlePullRequest(payload: unknown) {
  // TODO: Parse PR payload
  // Update session.prStatus based on action (opened, closed, merged)
  console.log("[webhook] pull_request received");
}
