import { Suspense } from "react";
import { NewSessionForm } from "./new-session-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Session",
};

export default function NewSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-8">
          <div className="mb-8">
            <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-surface-2" />
            ))}
          </div>
        </div>
      }
    >
      <NewSessionForm />
    </Suspense>
  );
}
