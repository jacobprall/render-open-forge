import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ApiKeysManager } from "./api-keys-manager";
import { AccessTokensManager } from "./access-tokens-manager";

export const metadata: Metadata = { title: "API Keys" };

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary">
            Personal Access Tokens
          </h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Generate tokens for authenticating MCP clients (Cursor, Claude Desktop) or API integrations
            with the gateway.
          </p>
        </div>
        <AccessTokensManager />
      </section>

      <section>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary">LLM API Keys</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Manage Anthropic and OpenAI credentials for the agent. Order of precedence: your personal key,
            then platform key, then environment variables on the web and worker.
          </p>
        </div>
        <ApiKeysManager />
      </section>
    </div>
  );
}
