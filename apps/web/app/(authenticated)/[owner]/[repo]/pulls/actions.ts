"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
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
  const session = await getSession();
  if (!session) redirect("/");

  const parsed = mergePullRequestSchema.safeParse({ owner, repo, number, method });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const forge = createForgeProvider(session.forgejoToken);
  try {
    const { owner: o, repo: r, number: n, method: m } = parsed.data;
    await forge.pulls.merge(o, r, n, m);
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
  const session = await getSession();
  if (!session) redirect("/");

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

  const forge = createForgeProvider(session.forgejoToken);
  try {
    const { owner: o, repo: r, title: t, body: b, head: h, base: baseBranch } = parsed.data;
    const pr = await forge.pulls.create({
      owner: o,
      repo: r,
      title: t,
      body: b,
      head: h,
      base: baseBranch,
    });
    return { number: pr.number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create pull request" };
  }
}
