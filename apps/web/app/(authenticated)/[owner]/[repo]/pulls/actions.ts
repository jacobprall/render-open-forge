"use server";

import { z } from "zod";
import { requireAuth, getPlatform } from "@/lib/platform";
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
  let auth;
  try {
    auth = await requireAuth();
  } catch {
    redirect("/");
  }

  const parsed = mergePullRequestSchema.safeParse({ owner, repo, number, method });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  try {
    const { owner: o, repo: r, number: n, method: m } = parsed.data;
    await getPlatform().pullRequests.mergePullRequest(auth, o, r, n, m);
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
  let auth;
  try {
    auth = await requireAuth();
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
    const result = await getPlatform().pullRequests.createPullRequest(auth, o, r, {
      title: t,
      body: b,
      head: h,
      base: baseBranch,
    });
    return { number: result.number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create pull request" };
  }
}
