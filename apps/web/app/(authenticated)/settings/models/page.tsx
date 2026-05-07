import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { resolveLlmApiKeys } from "@render-open-forge/shared";
import { userPreferences } from "@render-open-forge/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fetchModelsForSession, type ModelSummary } from "@/lib/models/anthropic-models";

export const metadata: Metadata = { title: "Models" };

const providerIcons: Record<string, React.ReactNode> = {
  anthropic: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.304 3.541l-5.296 16.918h3.208L20.512 3.54h-3.208zm-10.608 0L1.4 20.459h3.208l1.074-3.478h5.636l1.074 3.478h3.208L10.304 3.541H6.696zm.076 10.858l1.9-6.163 1.9 6.163H6.772z" />
    </svg>
  ),
  openai: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  ),
};

export default async function ModelsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();
  const keys = await resolveLlmApiKeys(db, String(session.userId));
  const models = await fetchModelsForSession(keys);

  let selectedModel: string | null = null;
  try {
    const [row] = await db
      .select({ data: userPreferences.data })
      .from(userPreferences)
      .where(eq(userPreferences.userId, String(session.userId)))
      .limit(1);
    if (row?.data?.defaultModelId) {
      selectedModel = row.data.defaultModelId;
    }
  } catch {
    // DB might not be ready
  }
  // Fall back to the first available model so the UI still highlights something sensible.
  if (!selectedModel) selectedModel = models[0]?.id ?? null;

  const grouped: Record<"anthropic" | "openai", ModelSummary[]> = {
    anthropic: models.filter((m) => m.provider === "anthropic"),
    openai: models.filter((m) => m.provider === "openai"),
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">AI Models</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Available models for agent sessions. Your current default is highlighted.
        </p>
      </div>

      {models.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-400">
          No models available. Add an API key in <span className="font-medium text-zinc-200">Settings → API Keys</span>{" "}
          or set <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> /
          <code className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">OPENAI_API_KEY</code>.
        </div>
      ) : (
        <div className="space-y-8">
          {(["anthropic", "openai"] as const).map((provider) => {
            const list = grouped[provider];
            if (list.length === 0) return null;
            return (
              <section key={provider}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-zinc-400">{providerIcons[provider]}</span>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                    {provider === "anthropic" ? "Anthropic" : "OpenAI"}
                  </h3>
                </div>
                <div className="space-y-2">
                  {list.map((model) => {
                    const isDefault = model.id === selectedModel;
                    return (
                      <div
                        key={model.id}
                        className={`rounded-xl border p-4 transition ${
                          isDefault
                            ? "border-accent/40 bg-accent-bg"
                            : "border-zinc-800 bg-zinc-900/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-zinc-100">{model.label}</h4>
                              {model.supportsThinking && (
                                <span className="rounded-full border border-purple-500/25 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                                  Thinking
                                </span>
                              )}
                              {isDefault && (
                                <span className="rounded-full border border-accent/25 bg-accent-bg px-2 py-0.5 text-[10px] font-medium text-accent-text">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="mt-1 font-mono text-xs text-zinc-600">{model.id}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-600">
        Anthropic models are fetched live from the provider so this list always reflects what your account currently
        supports. Default model selection is configured in your profile preferences.
      </p>
    </div>
  );
}
