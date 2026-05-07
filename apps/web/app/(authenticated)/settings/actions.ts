"use server";

import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { userPreferences } from "@render-open-forge/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export async function savePreferencesAction(formData: FormData): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) redirect("/");

  const defaultModelId = formData.get("defaultModelId") as string;
  const defaultSubagentModelId = formData.get("defaultSubagentModelId") as string;
  const defaultDiffMode = formData.get("defaultDiffMode") as "unified" | "split";
  const defaultWorkflowMode = formData.get("defaultWorkflowMode") as "full" | "standard" | "fast" | "yolo";
  const autoCommitPush = formData.get("autoCommitPush") === "on";
  const autoCreatePr = formData.get("autoCreatePr") === "on";

  try {
    const db = getDb();
    const userId = String(session.userId);

    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userPreferences)
        .set({
          defaultModelId: defaultModelId || null,
          defaultSubagentModelId: defaultSubagentModelId || null,
          defaultDiffMode,
          defaultWorkflowMode,
          autoCommitPush,
          autoCreatePr,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({
        id: randomUUID(),
        userId,
        defaultModelId: defaultModelId || null,
        defaultSubagentModelId: defaultSubagentModelId || null,
        defaultDiffMode,
        defaultWorkflowMode,
        autoCommitPush,
        autoCreatePr,
      });
    }

    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save preferences" };
  }
}
