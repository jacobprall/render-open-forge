import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; jobId: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, jobId } = await params;

  try {
    const logs = await getPlatform().repos.getJobLogs(auth, owner, repo, jobId);
    return new Response(logs, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return handlePlatformError(e);
  }
}
