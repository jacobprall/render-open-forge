"use server";

import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function mergePullRequestAction(
  owner: string,
  repo: string,
  number: number,
  method: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) redirect("/");

  const forge = createForgeProvider(session.forgejoToken);
  try {
    await forge.pulls.merge(
      owner,
      repo,
      number,
      method as "merge" | "squash" | "rebase",
    );
    revalidatePath(`/${owner}/${repo}/pulls/${number}`);
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

  const forge = createForgeProvider(session.forgejoToken);
  try {
    const pr = await forge.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    return { number: pr.number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create pull request" };
  }
}
