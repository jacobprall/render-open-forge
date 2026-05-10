"use server";

import { z } from "zod";
import { gatewayFetch, requireUserId } from "@/lib/gateway";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const mergePullRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
  method: z.enum(["merge", "squash", "rebase"]),
});

const createPullRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string(),
  head: z.string().min(1),
  base: z.string().min(1),
});

export async function mergePullRequestAction(
  owner: string,
  repo: string,
  number: number,
  method: string,
): Promise<{ error?: string }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    redirect("/");
  }

  const parsed = mergePullRequestSchema.safeParse({ owner, repo, number, method });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  try {
    const { owner: o, repo: r, number: n, method: m } = parsed.data;
    const res = await gatewayFetch(`/api/repos/${o}/${r}/pulls/${n}/merge`, {
      method: "POST",
      userId,
      body: JSON.stringify({ method: m }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { error: typeof body?.error === "string" ? body.error : "Merge failed" };
    }
    revalidatePath(`/${parsed.data.owner}/${parsed.data.repo}/pulls/${parsed.data.number}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Merge failed" };
  }
}

export async function createPullRequestAction(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<{ number?: number; error?: string }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    redirect("/");
  }

  const parsed = createPullRequestSchema.safeParse({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  try {
    const { owner: o, repo: r, title: t, body: b, head: h, base: baseBranch } = parsed.data;
    const res = await gatewayFetch(`/api/repos/${o}/${r}/pulls`, {
      method: "POST",
      userId,
      body: JSON.stringify({ title: t, body: b, head: h, base: baseBranch }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { error: typeof body?.error === "string" ? body.error : "Failed to create pull request" };
    }
    const result = await res.json();
    return { number: result.number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create pull request" };
  }
}
