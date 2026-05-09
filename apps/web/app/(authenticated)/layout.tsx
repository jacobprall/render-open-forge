import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DynamicShell } from "@/components/layout/dynamic-shell";
import { ThemeProvider, type ThemePreset } from "@/components/providers/theme-provider";
import { getDb } from "@/lib/db";
import { userPreferences } from "@openforge/db/schema";
import { eq } from "drizzle-orm";

const VALID_THEMES = new Set<ThemePreset>(["default", "terminal", "typewriter", "blueprint", "warm-analog"]);

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  let colors = { accentColor: null as string | null, secondaryColor: null as string | null, tertiaryColor: null as string | null };
  let theme: ThemePreset = "default";
  try {
    const db = getDb();
    const [row] = await db
      .select({ data: userPreferences.data })
      .from(userPreferences)
      .where(eq(userPreferences.userId, String(session.userId)))
      .limit(1);
    if (row?.data) {
      colors = {
        accentColor: row.data.accentColor ?? null,
        secondaryColor: row.data.secondaryColor ?? null,
        tertiaryColor: row.data.tertiaryColor ?? null,
      };
      const raw = row.data.theme as string | null | undefined;
      if (raw && VALID_THEMES.has(raw as ThemePreset)) {
        theme = raw as ThemePreset;
      }
    }
  } catch {}

  return (
    <ThemeProvider colors={colors} theme={theme}>
      <DynamicShell
        user={{
          username: session.username,
          avatarUrl: session.avatarUrl,
        }}
      >
        {children}
      </DynamicShell>
    </ThemeProvider>
  );
}
