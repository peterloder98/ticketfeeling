import { getPaymentProvider } from "@/lib/payments";

/** Visible only when PAYMENT_PROVIDER is unset or "dev". */
export function TestModeBanner({ compact = false }: { compact?: boolean }) {
  const provider = getPaymentProvider();
  if (provider.key !== "dev") return null;

  if (compact) {
    return (
      <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
        <strong>Testbetrieb:</strong> Zahlungen sind simuliert — keine echte Belastung. Tickets und
        PDF funktionieren zum Scanner-Test.
      </p>
    );
  }

  return (
    <div className="border-b border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.1)]">
      <div className="tf-container flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm text-[var(--tf-navy)]">
        <p>
          <strong>Testbetrieb aktiv</strong> — fiktive Käufe möglich (Dev-Zahlung). PDF erzeugen,
          dann unter{" "}
          <a href="/scanner" className="font-semibold underline underline-offset-2">
            /scanner
          </a>{" "}
          per Handy scannen.
        </p>
        <span className="text-xs text-[var(--tf-text-secondary)]">
          PAYMENT_PROVIDER=dev
        </span>
      </div>
    </div>
  );
}
