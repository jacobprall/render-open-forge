import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

const CONFIG_PATHS = [".forge/agents.yml", ".forge/agents.json"] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo } = await params;
  const forge = createForgeProvider(auth.forgejoToken);

  for (const path of CONFIG_PATHS) {
    try {
      const file = await forge.files.getContents(owner, repo, path);
      if (!Array.isArray(file) && file.type === "file" && file.content) {
        const decoded = Buffer.from(file.content, "base64").toString("utf-8");
        return NextResponse.json({ path, content: decoded, sha: file.sha });
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({ path: null, content: null, sha: null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo } = await params;

  let body: { content: string; path?: string; sha?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const filePath = body.path ?? ".forge/agents.json";
  const commitMessage = body.message ?? "Update agent configuration";
  const forge = createForgeProvider(auth.forgejoToken);

  try {
    let sha = body.sha;
    if (!sha) {
      try {
        const existing = await forge.files.getContents(owner, repo, filePath);
        if (!Array.isArray(existing) && existing.sha) {
          sha = existing.sha;
        }
      } catch {
        // File doesn't exist yet; create new
      }
    }

    const result = sha
      ? await forge.files.putFile(owner, repo, filePath, {
          content: body.content,
          message: commitMessage,
          sha,
        })
      : await forge.files.createFile(owner, repo, filePath, {
          content: body.content,
          message: commitMessage,
        });
    return NextResponse.json({ ok: true, file: result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to write config" },
      { status: 502 },
    );
  }
}
