import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats } from "@render-open-forge/db";
import type { ActiveSkillRef } from "@render-open-forge/skills";

export async function POST(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { repoPath, branch, title: rawTitle, activeSkills } = body as {
    repoPath?: string;
    branch?: string;
    title?: string;
    activeSkills?: ActiveSkillRef[];
  };

  if (!repoPath || !branch) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const title = (rawTitle && String(rawTitle).trim()) || "New session";

  const db = getDb();
  const sessionId = crypto.randomUUID();
  const chatId = crypto.randomUUID();

  await db.insert(sessions).values({
    id: sessionId,
    userId: String(userSession.userId),
    forgeUsername: userSession.username,
    title,
    status: "running",
    forgejoRepoPath: repoPath,
    branch,
    baseBranch: "main",
    phase: "execute",
    workflowMode: "standard",
    activeSkills: Array.isArray(activeSkills) && activeSkills.length > 0 ? activeSkills : null,
  });

  await db.insert(chats).values({
    id: chatId,
    sessionId,
    title,
  });

  return NextResponse.json({ sessionId });
}
