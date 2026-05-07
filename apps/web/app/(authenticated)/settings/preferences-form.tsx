"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { savePreferencesAction } from "./actions";

interface Prefs {
  defaultModelId: string | null;
  defaultSubagentModelId: string | null;
  defaultDiffMode: string | null;
  defaultWorkflowMode: string | null;
  autoCommitPush: boolean;
  autoCreatePr: boolean;
}

interface ModelOption {
  id: string;
  label: string;
  supportsThinking?: boolean;
}

function ModelSelect({
  name,
  value,
  onChange,
  models,
  loading,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  models: ModelOption[];
  loading: boolean;
  placeholder?: string;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {loading && <option disabled>Loading models…</option>}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}{m.supportsThinking ? " (thinking)" : ""}
        </option>
      ))}
    </select>
  );
}

async function modelsFetcher(url: string): Promise<ModelOption[]> {
  const r = await fetch(url);
  const data = (await r.json()) as { models?: ModelOption[] };
  return data.models ?? [];
}

export function PreferencesForm({ prefs }: { prefs: Prefs | null }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { data: models = [], isLoading: modelsLoading } = useSWR("/api/models", modelsFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const [defaultModelId, setDefaultModelId] = useState(prefs?.defaultModelId || "");
  const [subagentModelId, setSubagentModelId] = useState(prefs?.defaultSubagentModelId || "");

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await savePreferencesAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    });
  }

  return (
    <form action={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Preferences saved successfully.
        </div>
      )}

      <div className="space-y-6">
        {/* Default Model */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Default Model
          </label>
          <ModelSelect
            name="defaultModelId"
            value={defaultModelId}
            onChange={setDefaultModelId}
            models={models}
            loading={modelsLoading}
          />
          <p className="mt-1 text-xs text-zinc-500">Model used for main agent sessions</p>
        </div>

        {/* Default Subagent Model */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Default Subagent Model
          </label>
          <ModelSelect
            name="defaultSubagentModelId"
            value={subagentModelId}
            onChange={setSubagentModelId}
            models={models}
            loading={modelsLoading}
            placeholder="Same as main model"
          />
          <p className="mt-1 text-xs text-zinc-500">Model used for subagent tasks (optional)</p>
        </div>

        {/* Diff Mode */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Diff Mode
          </label>
          <div className="flex gap-2">
            {(["unified", "split"] as const).map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm transition has-checked:border-emerald-500 has-checked:bg-emerald-500/10"
              >
                <input
                  type="radio"
                  name="defaultDiffMode"
                  value={mode}
                  defaultChecked={(prefs?.defaultDiffMode || "unified") === mode}
                  className="sr-only"
                />
                <span className="text-zinc-300">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Workflow Mode */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Workflow Mode
          </label>
          <select
            name="defaultWorkflowMode"
            defaultValue={prefs?.defaultWorkflowMode || "standard"}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="full">Full — All phases including spec review</option>
            <option value="standard">Standard — Balanced execution</option>
            <option value="fast">Fast — Skip non-essential phases</option>
            <option value="yolo">YOLO — Minimal checks, maximum speed</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 p-4 transition hover:border-zinc-600">
            <div>
              <div className="text-sm font-medium text-zinc-300">Auto commit & push</div>
              <div className="text-xs text-zinc-500">Automatically commit and push changes after agent runs</div>
            </div>
            <input
              type="checkbox"
              name="autoCommitPush"
              defaultChecked={prefs?.autoCommitPush ?? false}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 p-4 transition hover:border-zinc-600">
            <div>
              <div className="text-sm font-medium text-zinc-300">Auto create PR</div>
              <div className="text-xs text-zinc-500">Automatically create a pull request when work is complete</div>
            </div>
            <input
              type="checkbox"
              name="autoCreatePr"
              defaultChecked={prefs?.autoCreatePr ?? false}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
            />
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 border-t border-zinc-800 pt-6">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isPending && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Save Preferences
          </button>
        </div>
      </div>
    </form>
  );
}
