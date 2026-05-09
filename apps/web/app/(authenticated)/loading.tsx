export default function AuthenticatedLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 h-8 w-48 animate-pulse bg-surface-2" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse border border-stroke-subtle bg-surface-1"
          />
        ))}
      </div>
    </div>
  );
}
