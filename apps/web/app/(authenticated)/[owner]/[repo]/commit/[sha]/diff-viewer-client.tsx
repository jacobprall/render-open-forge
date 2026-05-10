"use client";

import dynamic from "next/dynamic";

const UnifiedDiffViewer = dynamic(
  () =>
    import("@/components/diff-viewer").then((m) => ({
      default: m.UnifiedDiffViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-text-tertiary p-4">Loading diff...</div>
    ),
  },
);

export function CommitDiffViewer({ diff }: { diff: string }) {
  return <UnifiedDiffViewer diff={diff} />;
}
