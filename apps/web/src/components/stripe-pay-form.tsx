"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";

function PayInner({
  orderId,
  successPath,
}: {
  orderId: string;
  successPath: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${successPath}`,
      },
      redirect: "if_required",
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Zahlung fehlgeschlagen");
      return;
    }
    router.push(successPath);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
          wallets: { applePay: "auto", googlePay: "auto" },
        }}
      />
      {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
      <button type="submit" className="tf-btn tf-btn-primary w-full" disabled={!stripe || pending}>
        {pending ? "Zahlung läuft…" : "Jetzt bezahlen"}
      </button>
      <p className="text-center text-xs text-[var(--tf-text-secondary)]">
        Sichere Zahlungsabwicklung über Stripe.
      </p>
    </form>
  );
}

export function StripePayForm({
  clientSecret,
  orderId,
  publishableKey,
  successPath,
}: {
  clientSecret: string;
  orderId: string;
  publishableKey: string;
  /** Where to go after successful payment (embed: /embed/bestellung/…) */
  successPath?: string;
}) {
  if (!publishableKey) {
    return (
      <p className="text-sm text-[#b91c1c]">
        Stripe Publishable Key fehlt (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / STRIPE_PUBLISHABLE_KEY).
      </p>
    );
  }
  const resolvedSuccess = successPath ?? `/konto/bestellung/${orderId}?paid=1`;
  const stripePromise = loadStripe(publishableKey);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, locale: "de" }}>
      <PayInner orderId={orderId} successPath={resolvedSuccess} />
    </Elements>
  );
}
