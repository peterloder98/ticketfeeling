export default function SpeicherLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div>
        <div className="h-3 w-16 animate-pulse rounded bg-[rgba(20,184,166,0.2)]" />
        <div className="mt-3 h-9 w-40 animate-pulse rounded-lg bg-[rgba(15,39,71,0.08)]" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-[rgba(15,39,71,0.06)]" />
      </div>
      <div className="flex flex-wrap gap-2 border-b border-[var(--tf-line)] pb-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-[rgba(15,39,71,0.06)]" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="tf-card h-24 animate-pulse bg-[rgba(15,39,71,0.04)]" />
        ))}
      </div>
      <p className="text-sm text-[var(--tf-text-secondary)]">Speicher wird geladen …</p>
    </div>
  );
}
