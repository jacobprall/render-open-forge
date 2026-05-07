export default function SessionLoading() {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="h-5 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-zinc-800" />
      </div>
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-zinc-900/50"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
