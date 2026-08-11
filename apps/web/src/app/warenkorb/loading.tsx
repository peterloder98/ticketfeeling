export default function Loading() {
  return (
    <div className="tf-container py-12" aria-busy="true" aria-live="polite">
      <div className="h-10 w-48 animate-pulse rounded-xl bg-[rgba(15,39,71,0.08)]" />
      <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">Warenkorb wird geladen …</p>
      <div className="mt-8 space-y-3">
        <div className="h-24 animate-pulse rounded-[20px] border border-[var(--tf-line)] bg-white" />
        <div className="h-24 animate-pulse rounded-[20px] border border-[var(--tf-line)] bg-white" />
      </div>
    </div>
  );
}
