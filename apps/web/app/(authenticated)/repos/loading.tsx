export default function ReposLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-36 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-10 w-36 animate-pulse bg-surface-2" />
      </div>
      <div className="mb-4 h-9 animate-pulse rounded-md bg-surface-2" />
      <div className="rounded-lg border border-stroke-default overflow-hidden">
        <div className="border-b border-stroke-default bg-surface-1 px-4 py-2.5">
          <div className="flex gap-8">
            {["w-28", "w-40", "w-20", "w-24"].map((w, i) => (
              <div key={i} className={`h-3 ${w} animate-pulse rounded bg-surface-2`} />
            ))}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-stroke-default last:border-b-0 px-4 py-3">
            <div className="flex gap-8">
              {["w-36", "w-48", "w-16", "w-20"].map((w, j) => (
                <div key={j} className={`h-4 ${w} animate-pulse rounded bg-surface-2`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
