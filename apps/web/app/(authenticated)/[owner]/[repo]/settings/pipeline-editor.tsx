"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface PipelineStep {
  id: string;
  role: string;
  model: string;
  trigger: string;
  tools: string[];
}

interface VerifyCheck {
  name: string;
  command: string;
}

interface AgentConfig {
  pipeline: PipelineStep[];
  autoMerge: boolean;
  verifyChecks: VerifyCheck[];
}

const EMPTY_STEP: Omit<PipelineStep, "id"> = {
  role: "implement",
  model: "anthropic/claude-sonnet-4-5",
  trigger: "user_message",
  tools: [],
};

type Props = {
  owner: string;
  repo: string;
};

export function PipelineEditor({ owner, repo }: Props) {
  const base = useMemo(
    () => `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/agent-config`,
    [owner, repo],
  );

  const [config, setConfig] = useState<AgentConfig>({
    pipeline: [],
    autoMerge: false,
    verifyChecks: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newCheckName, setNewCheckName] = useState("");
  const [newCheckCmd, setNewCheckCmd] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setConfig({
          pipeline: data.pipeline ?? [],
          autoMerge: data.autoMerge ?? false,
          verifyChecks: data.verifyChecks ?? [],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function addStep() {
    const id = `step-${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      pipeline: [...prev.pipeline, { ...EMPTY_STEP, id }],
    }));
    setEditingId(id);
  }

  function removeStep(id: string) {
    setConfig((prev) => ({
      ...prev,
      pipeline: prev.pipeline.filter((s) => s.id !== id),
    }));
    if (editingId === id) setEditingId(null);
  }

  function updateStep(id: string, patch: Partial<PipelineStep>) {
    setConfig((prev) => ({
      ...prev,
      pipeline: prev.pipeline.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  function addCheck() {
    const name = newCheckName.trim();
    const command = newCheckCmd.trim();
    if (!name || !command) return;
    setConfig((prev) => ({
      ...prev,
      verifyChecks: [...prev.verifyChecks, { name, command }],
    }));
    setNewCheckName("");
    setNewCheckCmd("");
  }

  function removeCheck(idx: number) {
    setConfig((prev) => ({
      ...prev,
      verifyChecks: prev.verifyChecks.filter((_, i) => i !== idx),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to save config");
      setMessage("Pipeline configuration saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-stroke-subtle bg-surface-1 p-6">
      <h3 className="text-base font-semibold text-text-primary">Agent Pipeline</h3>
      <p className="mt-2 text-sm text-text-tertiary">
        Configure automated agent steps for this repository. Each step defines
        a role, model, trigger event, and available tools.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-text-tertiary">Loading…</p>
      ) : (
        <>
          {/* Pipeline steps */}
          <div className="mt-5 space-y-3">
            {config.pipeline.length === 0 && (
              <p className="text-sm text-text-tertiary">No pipeline steps configured.</p>
            )}
            {config.pipeline.map((step, idx) => (
              <div
                key={step.id}
                className="border border-stroke-default bg-surface-2 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-bg text-xs font-bold text-accent-text">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-sm text-text-primary">{step.role}</span>
                    <span className="bg-surface-3 px-1.5 py-0.5 text-xs text-text-tertiary">
                      {step.model}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === step.id ? null : step.id)}
                      className="border border-stroke-default px-3 py-1 text-xs font-medium text-text-tertiary transition-colors duration-(--of-duration-instant) hover:border-accent/40 hover:text-accent-text"
                    >
                      {editingId === step.id ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      className="border border-stroke-default px-3 py-1 text-xs font-medium text-text-tertiary transition-colors duration-(--of-duration-instant) hover:border-danger/40 hover:text-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-tertiary">
                  <span>trigger: {step.trigger}</span>
                  {step.tools.length > 0 && (
                    <span>tools: {step.tools.join(", ")}</span>
                  )}
                </div>

                {editingId === step.id && (
                  <div className="mt-4 grid gap-3 border-t border-stroke-default pt-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-text-tertiary">Role</label>
                      <select
                        value={step.role}
                        onChange={(e) => updateStep(step.id, { role: e.target.value })}
                        className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                      >
                        <option value="implement">Implement</option>
                        <option value="review">Review</option>
                        <option value="verify">Verify</option>
                        <option value="merge">Merge / Deliver</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-tertiary">Model</label>
                      <input
                        type="text"
                        value={step.model}
                        onChange={(e) => updateStep(step.id, { model: e.target.value })}
                        className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-tertiary">Trigger</label>
                      <select
                        value={step.trigger}
                        onChange={(e) => updateStep(step.id, { trigger: e.target.value })}
                        className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                      >
                        <option value="user_message">user_message</option>
                        <option value="ci_failure">ci_failure</option>
                        <option value="review_comment">review_comment</option>
                        <option value="pr_opened">pr_opened</option>
                        <option value="pr_merged">pr_merged</option>
                        <option value="workflow_run">workflow_run</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-tertiary">
                        Tools (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={step.tools.join(", ")}
                        onChange={(e) =>
                          updateStep(step.id, {
                            tools: e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="file_edit, shell, search"
                        className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addStep}
            className="mt-4 border border-dashed border-stroke-default px-4 py-2 text-sm font-medium text-text-tertiary transition-colors duration-(--of-duration-instant) hover:border-accent/40 hover:text-accent-text"
          >
            + Add Step
          </button>

          {/* Auto-merge toggle */}
          <div className="mt-6 border-t border-stroke-subtle pt-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.autoMerge}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, autoMerge: e.target.checked }))
                }
                className="h-4 w-4 rounded border-stroke-subtle bg-surface-2 text-accent-text focus:ring-accent"
              />
              <div>
                <span className="text-sm font-medium text-text-primary">Auto-merge</span>
                <p className="text-xs text-text-tertiary">
                  Automatically merge PRs when all checks pass and approvals are met.
                </p>
              </div>
            </label>
          </div>

          {/* Verify checks */}
          <div className="mt-6 border-t border-stroke-subtle pt-5">
            <h4 className="text-sm font-medium text-text-primary">Verify Checks</h4>
            <p className="mt-1 text-xs text-text-tertiary">
              Commands the agent runs to verify changes (tests, lint, typecheck).
            </p>

            {config.verifyChecks.length > 0 && (
              <ul className="mt-3 divide-y divide-stroke-subtle border border-stroke-subtle">
                {config.verifyChecks.map((check, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-text-primary">{check.name}</span>
                      <span className="ml-2 font-mono text-xs text-text-tertiary">{check.command}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCheck(idx)}
                      className="shrink-0 border border-stroke-default px-3 py-1 text-xs font-medium text-text-tertiary transition-colors duration-(--of-duration-instant) hover:border-danger/40 hover:text-danger"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="Check name"
                value={newCheckName}
                onChange={(e) => setNewCheckName(e.target.value)}
                className="flex-1 border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                placeholder="bun run test"
                value={newCheckCmd}
                onChange={(e) => setNewCheckCmd(e.target.value)}
                className="flex-1 border border-stroke-default bg-surface-2 px-3 py-2 font-mono text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={addCheck}
                disabled={!newCheckName.trim() || !newCheckCmd.trim()}
                className="shrink-0 border border-stroke-default px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-(--of-duration-instant) hover:border-accent/40 hover:text-accent-text disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Save */}
          <div className="mt-6 flex items-center gap-3 border-t border-stroke-subtle pt-5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="bg-accent px-5 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Pipeline"}
            </button>
          </div>
        </>
      )}

      {message && (
        <p className="mt-3 text-sm text-accent-text" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
