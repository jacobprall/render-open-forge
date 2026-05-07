import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DynamicShell } from "@/components/layout/dynamic-shell";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <DynamicShell
      user={{
        username: session.username,
        avatarUrl: session.avatarUrl,
      }}
    >
      {children}
    </DynamicShell>
  );
}
