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
      <div className="mb-6 h-10 animate-pulse bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse border border-stroke-subtle bg-surface-1" />
        ))}
      </div>
    </div>
  );
}
