export default function SessionLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-stroke-subtle px-4 py-3">
        <div className="h-5 w-48 animate-pulse rounded bg-surface-2" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-surface-2" />
      </div>
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse bg-surface-1"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
