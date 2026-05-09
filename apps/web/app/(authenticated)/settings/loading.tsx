export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="h-6 w-40 animate-pulse rounded bg-surface-2" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse border border-stroke-subtle bg-surface-1"
          />
        ))}
      </div>
    </div>
  );
}
