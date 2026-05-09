export default function SessionsListLoading() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-10 w-28 animate-pulse bg-surface-2" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse border border-stroke-subtle bg-surface-1" />
        ))}
      </div>
    </div>
  );
}
