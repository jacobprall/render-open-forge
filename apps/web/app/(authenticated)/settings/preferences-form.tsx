"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { savePreferencesAction } from "./actions";
import { AVAILABLE_COLORS, THEME_PRESETS, type ThemePreset } from "@/components/providers/theme-provider";
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
      <label className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</label>
      <p className="mb-3 text-xs text-text-tertiary">{description}</p>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`h-8 w-8 rounded-full transition-all ${COLOR_SWATCHES[color] ?? "bg-surface-3"} ${
              value === color
                ? "ring-2 ring-white ring-offset-2 ring-offset-surface-0 scale-110"
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
    <form action={handleSubmit} className="border border-stroke-subtle bg-surface-1 p-6">
      {error && (
        <div className="mb-4 border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 border border-accent/20 bg-accent-bg px-4 py-3 text-sm text-accent-text">
          Preferences saved successfully.
        </div>
      )}

      <div className="space-y-6">
        {/* Default Model */}
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

        {/* Default Subagent Model */}
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

        {/* Diff Mode */}
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

        {/* Toggles */}
        <div className="space-y-4">
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
        </div>

        {/* Theme Preset */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Theme
          </label>
          <p className="mb-3 text-xs text-text-tertiary">
            Choose an overall visual theme for the interface
          </p>
          <input type="hidden" name="theme" value={theme} />
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setTheme(preset.id);
                  document.documentElement.setAttribute("data-theme", preset.id === "default" ? "" : preset.id);
                  if (preset.id === "default") document.documentElement.removeAttribute("data-theme");
                }}
                className={`border px-4 py-2 text-sm font-medium transition-colors duration-(--of-duration-instant) ${
                  theme === preset.id
                    ? "border-accent bg-accent-bg text-accent-text"
                    : "border-stroke-default bg-surface-2 text-text-secondary hover:bg-surface-3"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Colors */}
        <div className="space-y-5 border border-stroke-subtle bg-surface-1 p-5">
          <h3 className="text-sm font-semibold text-text-primary">Theme Colors</h3>
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
        <div className="flex items-center gap-3 border-t border-stroke-subtle pt-6">
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
      </div>
    </form>
  );
}
