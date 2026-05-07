"use server";

import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { redirect } from "next/navigation";

export async function deleteRepoAction(
  owner: string,
  repo: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) redirect("/");

  const forge = createForgeProvider(session.forgejoToken);
  try {
    await forge.repos.delete(owner, repo);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete repository" };
  }
}
