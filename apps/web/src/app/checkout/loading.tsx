export default function Loading() {
  return (
    <div className="tf-container py-12" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="h-9 w-48 animate-pulse rounded-xl bg-[rgba(15,39,71,0.08)]" />
        <p className="text-sm text-[var(--tf-text-secondary)]">Kasse wird vorbereitet …</p>
        <div className="h-64 animate-pulse rounded-[20px] border border-[var(--tf-line)] bg-white" />
      </div>
    </div>
  );
}
