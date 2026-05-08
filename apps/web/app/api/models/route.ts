import { NextResponse } from "next/server";
import { resolveLlmApiKeys } from "@render-open-forge/platform";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fetchModelsForSession } from "@/lib/models/anthropic-models";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const keys = await resolveLlmApiKeys(db, String(session.userId));
  const models = await fetchModelsForSession(keys);
  return NextResponse.json({ models });
}
