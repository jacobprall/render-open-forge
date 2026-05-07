import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { ensureUserSkillsRepo } from "@render-open-forge/skills";

/** Optional: re-ensure user skills repo and seed. Full DB cache sync can be added later. */
export async function POST() {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forge = createForgeProvider(auth.forgejoToken);
  await ensureUserSkillsRepo(forge, auth.username);
  return NextResponse.json({ ok: true });
}
