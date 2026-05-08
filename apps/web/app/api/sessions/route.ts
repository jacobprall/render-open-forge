import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats } from "@render-open-forge/db";

const activeSkillRefSchema = z.object({
  source: z.enum(["builtin", "user", "repo"]),
  slug: z.string().min(1),
});

const createSessionBodySchema = z.object({
  repoPath: z.string().min(1),
  branch: z.string().min(1),
  title: z.string().max(200).optional(),
  activeSkills: z.array(activeSkillRefSchema).optional(),
});

export async function POST(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { repoPath, branch, title: rawTitle, activeSkills } = parsed.data;

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
