"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { savePreferencesAction } from "./actions";
import { AVAILABLE_COLORS } from "@/components/providers/theme-provider";
import type { UserPreferencesData } from "@render-open-forge/db/schema";

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
      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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

const COLOR_SWATCHES: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
  indigo: "bg-indigo-500",
};

function ColorPicker({
  label,
  description,
  name,
  value,
  onChange,
}: {
  label: string;
  description: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</label>
      <p className="mb-3 text-xs text-zinc-500">{description}</p>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`h-8 w-8 rounded-full transition-all ${COLOR_SWATCHES[color] ?? "bg-zinc-600"} ${
              value === color
                ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110"
                : "hover:scale-110 opacity-70 hover:opacity-100"
            }`}
            aria-label={color}
            title={color.charAt(0).toUpperCase() + color.slice(1)}
          />
        ))}
      </div>
    </div>
  );
}

export function PreferencesForm({ prefs }: { prefs: UserPreferencesData | null }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { data: models = [], isLoading: modelsLoading } = useSWR("/api/models", modelsFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const [defaultModelId, setDefaultModelId] = useState(prefs?.defaultModelId || "");
  const [subagentModelId, setSubagentModelId] = useState(prefs?.defaultSubagentModelId || "");
  const [accentColor, setAccentColor] = useState(prefs?.accentColor || "emerald");
  const [secondaryColor, setSecondaryColor] = useState(prefs?.secondaryColor || "blue");
  const [tertiaryColor, setTertiaryColor] = useState(prefs?.tertiaryColor || "violet");

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
        <div className="mb-4 rounded-lg border border-accent/20 bg-accent-bg px-4 py-3 text-sm text-accent-text">
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
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm transition has-checked:border-accent has-checked:bg-accent-bg"
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
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent focus:ring-offset-0"
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
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent focus:ring-offset-0"
            />
          </label>
        </div>

        {/* Theme Colors */}
        <div className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-zinc-200">Theme Colors</h3>
          <ColorPicker
            label="Accent"
            description="Primary brand color used for buttons, links, and focus rings"
            name="accentColor"
            value={accentColor}
            onChange={setAccentColor}
          />
          <ColorPicker
            label="Secondary"
            description="Used for secondary actions and informational highlights"
            name="secondaryColor"
            value={secondaryColor}
            onChange={setSecondaryColor}
          />
          <ColorPicker
            label="Tertiary"
            description="Used for tags, categories, and decorative accents"
            name="tertiaryColor"
            value={tertiaryColor}
            onChange={setTertiaryColor}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 border-t border-zinc-800 pt-6">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
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
