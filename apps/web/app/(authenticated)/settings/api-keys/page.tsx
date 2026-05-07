import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ApiKeysManager } from "./api-keys-manager";

export const metadata: Metadata = { title: "API Keys" };

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">LLM API keys</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Manage Anthropic and OpenAI credentials for the agent. Order of precedence: your personal key,
          then platform key, then environment variables on the web and worker.
        </p>
      </div>
      <ApiKeysManager />
    </div>
  );
}
