export default function Loading() {
  return (
    <div className="tf-container py-16" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto h-10 w-40 animate-pulse rounded-full bg-[rgba(15,39,71,0.08)]" />
        <p className="text-sm font-medium text-[var(--tf-text-secondary)]">Wird geladen …</p>
        <div className="mx-auto h-1.5 w-28 overflow-hidden rounded-full bg-[rgba(20,184,166,0.15)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--tf-teal)]" />
        </div>
      </div>
    </div>
  );
}
