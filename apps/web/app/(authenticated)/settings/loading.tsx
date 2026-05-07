export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="h-6 w-40 animate-pulse rounded bg-zinc-800" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50"
          />
        ))}
      </div>
    </div>
  );
}
