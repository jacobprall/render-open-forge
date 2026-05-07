import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; jobId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, jobId } = await params;
  const forge = createForgeProvider(session.forgejoToken);
  try {
    const logs = await forge.ci.getJobLogs(owner, repo, jobId);
    return new Response(logs, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Logs unavailable" },
      { status: 502 },
    );
  }
}
