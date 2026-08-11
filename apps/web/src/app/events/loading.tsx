export default function Loading() {
  return (
    <div className="tf-container py-12" aria-busy="true" aria-live="polite">
      <div className="h-10 w-56 animate-pulse rounded-xl bg-[rgba(15,39,71,0.08)]" />
      <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">Events werden geladen …</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[19px] border border-[var(--tf-line)] bg-white"
          >
            <div className="aspect-square animate-pulse bg-[rgba(15,39,71,0.06)]" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-[rgba(15,39,71,0.08)]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-[rgba(15,39,71,0.06)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
