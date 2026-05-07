"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface QuotaItem {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

function barColor(pct: number): string {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

function textColor(pct: number): string {
  if (pct >= 85) return "text-red-400";
  if (pct >= 60) return "text-amber-400";
  return "text-emerald-400";
}

export default function OrgUsagePage() {
  const params = useParams<{ org: string }>();
  const org = params.org;

  const [quotas, setQuotas] = useState<QuotaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/usage`);
        if (!res.ok) {
          setError("Failed to load usage data");
          return;
        }
        const data = await res.json();
        setQuotas(data.quotas ?? []);
      } catch {
        setError("Failed to load usage data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [org]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold text-zinc-100">
        Usage Dashboard
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Resource usage for <span className="font-medium text-zinc-200">{org}</span>
      </p>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading usage data...</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : quotas.length === 0 ? (
        <p className="text-sm text-zinc-400">No usage data available.</p>
      ) : (
        <div className="space-y-4">
          {quotas.map((q) => {
            const pct = q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
            return (
              <div
                key={q.label}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-zinc-200">
                    {q.label}
                  </span>
                  <span className={`text-xs font-mono ${textColor(pct)}`}>
                    {q.used.toLocaleString()} / {q.limit.toLocaleString()} {q.unit}
                    <span className="ml-2 text-zinc-500">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${barColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
