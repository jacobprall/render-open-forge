"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";

interface QuotaItem {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface UsagePayload {
  quotas?: QuotaItem[];
}

async function usageFetcher(url: string): Promise<QuotaItem[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load usage data");
  const data = (await res.json()) as UsagePayload;
  return data.quotas ?? [];
}

function barColor(pct: number): string {
  if (pct >= 85) return "bg-danger";
  if (pct >= 60) return "bg-amber-500";
  return "bg-accent";
}

function textColor(pct: number): string {
  if (pct >= 85) return "text-danger";
  if (pct >= 60) return "text-warning";
  return "text-accent-text";
}

export default function OrgUsagePage() {
  const params = useParams<{ org: string }>();
  const org = params.org;

  const {
    data: quotas = [],
    isLoading: loading,
    error: swrError,
  } = useSWR(`/api/orgs/${encodeURIComponent(org)}/usage`, usageFetcher, {
    revalidateOnFocus: true,
  });

  const error = swrError ? "Failed to load usage data" : null;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold text-text-primary">
        Usage Dashboard
      </h1>
      <p className="mb-6 text-sm text-text-tertiary">
        Resource usage for <span className="font-medium text-text-primary">{org}</span>
      </p>

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading usage data...</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : quotas.length === 0 ? (
        <p className="text-sm text-text-tertiary">No usage data available.</p>
      ) : (
        <div className="space-y-4">
          {quotas.map((q) => {
            const pct = q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
            return (
              <div
                key={q.label}
                className="border border-stroke-subtle bg-surface-1 p-4"
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    {q.label}
                  </span>
                  <span className={`text-xs font-mono ${textColor(pct)}`}>
                    {q.used.toLocaleString()} / {q.limit.toLocaleString()} {q.unit}
                    <span className="ml-2 text-text-tertiary">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
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
