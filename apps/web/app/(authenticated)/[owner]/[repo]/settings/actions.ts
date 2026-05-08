"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { redirect } from "next/navigation";

const slugPartSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_.-]+$/);

const deleteRepoSchema = z.object({
  owner: slugPartSchema,
  repo: slugPartSchema,
});

export async function deleteRepoAction(
  owner: string,
  repo: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) redirect("/");

  const parsed = deleteRepoSchema.safeParse({ owner, repo });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const forge = createForgeProvider(session.forgejoToken);
  try {
    await forge.repos.delete(parsed.data.owner, parsed.data.repo);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete repository" };
  }
}
