export default function Loading() {
  return (
    <div className="tf-container py-12" aria-busy="true" aria-live="polite">
      <div className="h-10 w-40 animate-pulse rounded-xl bg-[rgba(15,39,71,0.08)]" />
      <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">Konto wird geladen …</p>
      <div className="mt-8 space-y-3">
        <div className="h-20 animate-pulse rounded-[20px] border border-[var(--tf-line)] bg-white" />
        <div className="h-20 animate-pulse rounded-[20px] border border-[var(--tf-line)] bg-white" />
      </div>
    </div>
  );
}
