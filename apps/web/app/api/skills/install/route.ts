import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import {
  ensureUserSkillsRepo,
  FORGE_SKILLS_REPO_NAME,
  parseSkillMarkdown,
} from "@render-open-forge/skills";

const USER_SKILLS_DIR = "skills";

function toRawUrl(url: string): string {
  const gh = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
  );
  if (gh) {
    return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}/${gh[4]}`;
  }
  return url;
}

function slugFromUrl(url: string): string {
  const segments = url.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "skill";
  return last
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const customSlug = typeof body?.slug === "string" ? body.slug.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const rawUrl = toRawUrl(url);

  let markdown: string;
  try {
    const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch skill: ${res.status} ${res.statusText}` },
        { status: 422 },
      );
    }
    markdown = await res.text();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch URL" },
      { status: 422 },
    );
  }

  const parsed = parseSkillMarkdown(markdown);
  if (!parsed.body.trim()) {
    return NextResponse.json(
      { error: "Fetched content doesn't look like a valid skill (no body)" },
      { status: 422 },
    );
  }

  const slug = customSlug || parsed.name?.toLowerCase().replace(/\s+/g, "-") || slugFromUrl(url);
  const forge = createForgeProvider(auth.forgejoToken);

  await ensureUserSkillsRepo(forge, auth.username);

  const filePath = `${USER_SKILLS_DIR}/${slug}.md`;

  try {
    await forge.files.createFile(
      auth.username,
      FORGE_SKILLS_REPO_NAME,
      filePath,
      {
        content: markdown,
        message: `install skill: ${parsed.name || slug}`,
      },
    );
  } catch {
    try {
      const existing = await forge.files.getContents(
        auth.username,
        FORGE_SKILLS_REPO_NAME,
        filePath,
      );
      const sha = Array.isArray(existing) ? undefined : existing.sha;
      await forge.files.putFile(
        auth.username,
        FORGE_SKILLS_REPO_NAME,
        filePath,
        {
          content: markdown,
          message: `update skill: ${parsed.name || slug}`,
          sha,
        },
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to save skill" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    slug,
    name: parsed.name || slug,
    description: parsed.description,
  });
}
