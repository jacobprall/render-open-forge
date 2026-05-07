import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats } from "@render-open-forge/db";

export async function POST(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { repoPath, branch, title, workflowMode } = body;

  if (!repoPath || !branch || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getDb();
  const sessionId = crypto.randomUUID();
  const chatId = crypto.randomUUID();

  await db.insert(sessions).values({
    id: sessionId,
    userId: String(userSession.userId),
    title,
    status: "running",
    forgejoRepoPath: repoPath,
    branch,
    baseBranch: "main",
    phase: workflowMode === "full" ? "understand" : "execute",
    workflowMode: workflowMode ?? "standard",
  });

  await db.insert(chats).values({
    id: chatId,
    sessionId,
    title,
  });

  return NextResponse.json({ sessionId });
}
