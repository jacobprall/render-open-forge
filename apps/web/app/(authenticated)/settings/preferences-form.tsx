"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { savePreferencesAction } from "./actions";
import { THEME_PRESETS, type ThemePreset } from "@/components/providers/theme-provider";
import type { UserPreferencesData } from "@openforge/db/schema";

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
      className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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

function ThemeSwatch({ preset, selected, onClick }: {
  preset: (typeof THEME_PRESETS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col overflow-hidden border-2 transition-all duration-(--of-duration-instant) ${
        selected
          ? "border-accent shadow-[0_0_0_1px_var(--of-accent)]"
          : "border-stroke-subtle hover:border-stroke-default"
      }`}
    >
      <div
        className="flex h-16 items-end gap-1 p-2"
        style={{ backgroundColor: preset.swatch.bg }}
      >
        <div className="h-3 w-8" style={{ backgroundColor: preset.swatch.accent }} />
        <div className="h-2 w-12 opacity-50" style={{ backgroundColor: preset.swatch.fg }} />
        <div className="h-2 w-6 opacity-25" style={{ backgroundColor: preset.swatch.fg }} />
      </div>
      <div className="flex flex-col items-start bg-surface-1 px-3 py-2">
        <span className="text-[13px] font-medium text-text-primary">{preset.label}</span>
        <span className="text-[11px] text-text-tertiary">{preset.description}</span>
      </div>
    </button>
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
  const [theme, setTheme] = useState<ThemePreset>((prefs?.theme as ThemePreset) || "default");

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
    <form action={handleSubmit} className="space-y-8">
      {error && (
        <div className="border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="border border-accent/20 bg-accent-bg px-4 py-3 text-sm text-accent-text">
          Preferences saved successfully.
        </div>
      )}

      {/* Theme */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Theme</h3>
        <p className="mb-4 text-[13px] text-text-tertiary">
          Each theme sets its own palette, typography, and accent colors.
        </p>
        <input type="hidden" name="theme" value={theme} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEME_PRESETS.map((preset) => (
            <ThemeSwatch
              key={preset.id}
              preset={preset}
              selected={theme === preset.id}
              onClick={() => {
                setTheme(preset.id);
                const root = document.documentElement;
                if (preset.id === "default") {
                  root.removeAttribute("data-theme");
                } else {
                  root.setAttribute("data-theme", preset.id);
                }
              }}
            />
          ))}
        </div>
      </section>

      {/* Models */}
      <section className="border border-stroke-subtle bg-surface-1 p-6 space-y-6">
        <h3 className="text-sm font-semibold text-text-primary">Models</h3>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Default Model
          </label>
          <ModelSelect
            name="defaultModelId"
            value={defaultModelId}
            onChange={setDefaultModelId}
            models={models}
            loading={modelsLoading}
          />
          <p className="mt-1 text-xs text-text-tertiary">Model used for main agent sessions</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
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
          <p className="mt-1 text-xs text-text-tertiary">Model used for subagent tasks (optional)</p>
        </div>
      </section>

      {/* Workflow */}
      <section className="border border-stroke-subtle bg-surface-1 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Workflow</h3>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Diff Mode
          </label>
          <div className="flex gap-2">
            {(["unified", "split"] as const).map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-2 border border-stroke-default px-4 py-2 text-sm transition-colors duration-(--of-duration-instant) has-checked:border-accent has-checked:bg-accent-bg"
              >
                <input
                  type="radio"
                  name="defaultDiffMode"
                  value={mode}
                  defaultChecked={(prefs?.defaultDiffMode || "unified") === mode}
                  className="sr-only"
                />
                <span className="text-text-secondary">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between border border-stroke-default p-4 transition-colors duration-(--of-duration-instant) hover:border-stroke-subtle">
          <div>
            <div className="text-sm font-medium text-text-secondary">Auto commit & push</div>
            <div className="text-xs text-text-tertiary">Automatically commit and push changes after agent runs</div>
          </div>
          <input
            type="checkbox"
            name="autoCommitPush"
            defaultChecked={prefs?.autoCommitPush ?? false}
            className="h-4 w-4 border-stroke-default bg-surface-2 text-accent focus:ring-accent focus:ring-offset-0"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between border border-stroke-default p-4 transition-colors duration-(--of-duration-instant) hover:border-stroke-subtle">
          <div>
            <div className="text-sm font-medium text-text-secondary">Auto create PR</div>
            <div className="text-xs text-text-tertiary">Automatically create a pull request when work is complete</div>
          </div>
          <input
            type="checkbox"
            name="autoCreatePr"
            defaultChecked={prefs?.autoCreatePr ?? false}
            className="h-4 w-4 border-stroke-default bg-surface-2 text-accent focus:ring-accent focus:ring-offset-0"
          />
        </label>
      </section>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending && (
            <span className="inline-flex animate-spin">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </span>
          )}
          Save Preferences
        </button>
      </div>
    </form>
  );
}
