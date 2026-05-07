export default function SessionsListLoading() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-800/50" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-800/50 bg-zinc-900/40" />
        ))}
      </div>
    </div>
  );
}
