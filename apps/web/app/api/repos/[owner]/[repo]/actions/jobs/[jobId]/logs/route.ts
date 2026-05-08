import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

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
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Logs unavailable" },
      { status: 502 },
    );
  }
}
