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
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Profile</h2>
        <div className="border border-stroke-subtle bg-surface-1 p-6">
          <div className="flex items-center gap-4">
            {session.avatarUrl ? (
              <Image
                src={session.avatarUrl}
                alt={session.username}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border-2 border-stroke-default"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-xl font-bold text-text-tertiary">
                {session.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{session.username}</h3>
              <p className="text-sm text-text-tertiary">{session.email}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            Profile information is synced from your connected forge account.
          </p>
        </div>
      </section>

      {/* Preferences section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Preferences</h2>
        <PreferencesForm prefs={prefs} />
      </section>
    </div>
  );
}
