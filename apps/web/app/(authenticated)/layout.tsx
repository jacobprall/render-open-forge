import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DynamicShell } from "@/components/layout/dynamic-shell";
import { ThemeProvider, type ThemePreset } from "@/components/providers/theme-provider";
import { getUserPreferences } from "@/lib/db/loaders";

const VALID_THEMES = new Set<ThemePreset>(["default", "terminal", "typewriter", "blueprint", "warm-analog"]);

function AuthenticatedAppSkeleton() {
  return (
    <div className="min-h-screen bg-surface-0">
      <div className="flex h-12 animate-pulse border-b border-stroke-subtle bg-surface-1" />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 h-8 w-48 animate-pulse bg-surface-2" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse border border-stroke-subtle bg-surface-1"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

async function AuthenticatedBody({
  session,
  children,
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  children: React.ReactNode;
}) {
  let theme: ThemePreset = "default";
  try {
    const row = await getUserPreferences(String(session.userId));
    if (row?.data) {
      const raw = row.data.theme as string | null | undefined;
      if (raw && VALID_THEMES.has(raw as ThemePreset)) {
        theme = raw as ThemePreset;
      }
    }
  } catch {
    /* DB might not be ready */
  }

  return (
    <ThemeProvider theme={theme}>
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

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <Suspense fallback={<AuthenticatedAppSkeleton />}>
      <AuthenticatedBody session={session}>{children}</AuthenticatedBody>
    </Suspense>
  );
}
