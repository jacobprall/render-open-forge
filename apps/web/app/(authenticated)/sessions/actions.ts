"use server";

import { getPlatform, requireAuth } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";
import { revalidatePath } from "next/cache";

export async function archiveSessionAction(sessionId: string): Promise<{ error?: string }> {
  try {
    const auth = await requireAuth();
    await getPlatform().sessions.archive(auth, sessionId);
    revalidatePath("/sessions");
    revalidatePath("/", "layout");
    return {};
  } catch (err) {
    if (err instanceof AppError) {
      return { error: err.message };
    }
    if (err instanceof Response) {
      const body = await err.json().catch(() => null);
      return { error: body?.error ?? "Unauthorized" };
    }
    return { error: err instanceof Error ? err.message : "Failed to archive session" };
  }
}
