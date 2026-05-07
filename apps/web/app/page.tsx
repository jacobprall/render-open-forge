import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect("/repos");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">render-open-forge</h1>
        <p className="mt-3 text-lg text-zinc-400">
          Self-hosted agentic forge — code hosting, CI, and AI development in one platform.
        </p>
      </div>
      <Link
        href="/api/auth/login"
        className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
      >
        Sign in with Google
      </Link>
    </main>
  );
}
