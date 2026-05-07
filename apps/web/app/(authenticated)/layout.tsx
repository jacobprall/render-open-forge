import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DynamicShell } from "@/components/layout/dynamic-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getDb } from "@/lib/db";
import { userPreferences } from "@render-open-forge/db/schema";
import { eq } from "drizzle-orm";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  let colors = { accentColor: null as string | null, secondaryColor: null as string | null, tertiaryColor: null as string | null };
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
    }
  } catch {}

  return (
    <ThemeProvider colors={colors}>
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
