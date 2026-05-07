"use client";

import { useState, useEffect, useRef } from "react";
import type { ModelSummary } from "@render-open-forge/shared/client";

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  compact?: boolean;
}

export function ModelSelector({ value, onChange, compact }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => setModels(data.models ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = models.find((m) => m.id === value);

  if (loading) {
    return <div className="h-8 w-32 animate-pulse rounded bg-zinc-800" />;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-600"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onChange(model.id);
                setIsOpen(false);
              }}
              className={`flex w-full flex-col px-3 py-2.5 text-left transition hover:bg-zinc-800 ${
                model.id === value ? "bg-zinc-800/50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">{model.label}</span>
                {model.id === value && (
                  <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              {!compact && model.description && (
                <span className="mt-0.5 text-xs text-zinc-500">{model.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
