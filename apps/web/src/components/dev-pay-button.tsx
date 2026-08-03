"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DevPayButton({
  orderId,
  amountLabel,
  successPath,
  accessToken,
}: {
  orderId: string;
  amountLabel: string;
  successPath?: string;
  /** Order access token from pay URL (`?t=`) — required for guest checkout. */
  accessToken?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/payments/dev/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          ...(accessToken ? { t: accessToken } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = data?.error?.code ?? "Zahlung fehlgeschlagen";
        setError(
          code === "FORBIDDEN"
            ? "Sitzung abgelaufen — bitte den Kauf noch einmal starten."
            : code === "GONE"
              ? "Testzahlung ist hier nicht aktiv (PAYMENT_PROVIDER)."
              : code === "PAYMENT_NOT_FOUND"
                ? "Zahlung nicht gefunden — bitte Support oder neu bestellen."
                : String(code),
        );
        return;
      }
      router.push(successPath ?? `/konto/bestellung/${orderId}`);
      router.refresh();
    } catch {
      setError("Netzwerkfehler — bitte noch einmal versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Jetzt bezahlen</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--tf-text-secondary)]">
          Mit dem Klick bestätigst du die Zahlung von <strong>{amountLabel}</strong>. Danach
          erhältst du deine Tickets inkl. QR-Code zum Einlass — als PDF und in deiner Bestellung.
        </p>
      </div>
      <p className="rounded-[14px] border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm text-[var(--tf-navy)]">
        Testmodus: Es wird nichts wirklich abgebucht. Ideal zum Ausprobieren von Kauf, PDF und
        Scanner.
      </p>
      <button
        type="button"
        className="tf-btn tf-btn-primary w-full !min-h-12 text-base"
        onClick={() => void pay()}
        disabled={loading}
      >
        {loading ? "Einen Moment…" : `Jetzt ${amountLabel} bezahlen`}
      </button>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
