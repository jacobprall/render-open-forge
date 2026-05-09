import type { Metadata } from "next";
import Image from "next/image";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { userPreferences } from "@openforge/db/schema";
import { eq } from "drizzle-orm";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  let prefs = null;
  try {
    const db = getDb();
    const [row] = await db
      .select({ data: userPreferences.data })
      .from(userPreferences)
      .where(eq(userPreferences.userId, String(session.userId)))
      .limit(1);
    prefs = row?.data ?? null;
  } catch {
    // DB might not be ready
  }

  return (
    <div className="space-y-8">
      {/* Profile section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Profile</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center gap-4">
            {session.avatarUrl ? (
              <Image
                src={session.avatarUrl}
                alt={session.username}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border-2 border-zinc-700"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-xl font-bold text-zinc-400">
                {session.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">{session.username}</h3>
              <p className="text-sm text-zinc-400">{session.email}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Profile information is synced from your connected forge account.
          </p>
        </div>
      </section>

      {/* Preferences section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Preferences</h2>
        <PreferencesForm prefs={prefs} />
      </section>
    </div>
  );
}
