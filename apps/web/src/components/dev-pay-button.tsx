"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DevPayButton({
  orderId,
  providerPaymentId,
  amountLabel,
  successPath,
}: {
  orderId: string;
  providerPaymentId: string;
  amountLabel: string;
  successPath?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const eventId = `evt_${orderId}_${Date.now()}`;
      const response = await fetch("/api/v1/payments/webhooks/dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerEventId: eventId,
          providerPaymentId,
          secret: "dev-webhook-secret",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.code ?? "Zahlung fehlgeschlagen");
        return;
      }
      router.push(successPath ?? `/konto/bestellung/${orderId}?paid=1`);
      router.refresh();
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
