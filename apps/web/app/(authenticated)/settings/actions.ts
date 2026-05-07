"use server";

import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { userPreferences } from "@render-open-forge/db/schema";
import type { UserPreferencesData } from "@render-open-forge/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export async function savePreferencesAction(formData: FormData): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) redirect("/");

  const data: UserPreferencesData = {
    defaultModelId: (formData.get("defaultModelId") as string) || null,
    defaultSubagentModelId: (formData.get("defaultSubagentModelId") as string) || null,
    defaultDiffMode: (formData.get("defaultDiffMode") as "unified" | "split") ?? "unified",
    defaultWorkflowMode: (formData.get("defaultWorkflowMode") as "full" | "standard" | "fast" | "yolo") ?? "standard",
    autoCommitPush: formData.get("autoCommitPush") === "on",
    autoCreatePr: formData.get("autoCreatePr") === "on",
    accentColor: (formData.get("accentColor") as string) || null,
    secondaryColor: (formData.get("secondaryColor") as string) || null,
    tertiaryColor: (formData.get("tertiaryColor") as string) || null,
  };

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
        .set({ data, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({
        id: randomUUID(),
        userId,
        data,
      });
    }

    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save preferences" };
  }
}
