"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import { translateStripePaymentError } from "@/lib/commerce/payment-fees";

function PayInner({
  successPath,
  processingPath,
  isSepa,
}: {
  successPath: string;
  processingPath: string;
  isSepa: boolean;
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
        return_url: `${window.location.origin}${isSepa ? processingPath : successPath}`,
      },
      redirect: "if_required",
    });
    setPending(false);
    if (result.error) {
      setError(translateStripePaymentError(result.error.message));
      return;
    }
    const status = result.paymentIntent?.status;
    if (status === "processing" || status === "requires_action" || isSepa) {
      router.push(processingPath);
    } else {
      router.push(successPath);
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isSepa ? (
        <p className="rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] px-3 py-2 text-sm text-[var(--tf-text-secondary)]">
          Die IBAN findest du auf deiner Bankkarte, deinem Kontoauszug oder im Online-Banking.
          Mit der Bestätigung erteilst du Stripe das Mandat für den Lastschrifteinzug.
        </p>
      ) : null}
      <PaymentElement
        options={{
          layout: "tabs",
          paymentMethodOrder: isSepa ? ["sepa_debit"] : ["card", "apple_pay", "google_pay"],
          wallets: isSepa
            ? { applePay: "never", googlePay: "never" }
            : { applePay: "auto", googlePay: "auto" },
        }}
      />
      {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
      <button type="submit" className="tf-btn tf-btn-primary w-full" disabled={!stripe || pending}>
        {pending ? "Zahlung läuft…" : isSepa ? "Lastschrift verbindlich erteilen" : "Jetzt bezahlen"}
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
  processingPath,
  paymentMethod,
}: {
  clientSecret: string;
  orderId: string;
  publishableKey: string;
  /** Where to go after confirmed card/wallet payment */
  successPath?: string;
  /** Where to go while SEPA is still processing */
  processingPath?: string;
  paymentMethod?: string | null;
}) {
  if (!publishableKey) {
    return (
      <p className="text-sm text-[#b91c1c]">
        Stripe Publishable Key fehlt (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / STRIPE_PUBLISHABLE_KEY).
      </p>
    );
  }
  const isSepa =
    paymentMethod === "sepa_debit" ||
    paymentMethod === "stripe_sepa";
  const resolvedSuccess = successPath ?? `/konto/bestellung/${orderId}`;
  const resolvedProcessing = processingPath ?? `/konto/bestellung/${orderId}`;
  const stripePromise = loadStripe(publishableKey);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, locale: "de" }}>
      <PayInner
        successPath={resolvedSuccess}
        processingPath={resolvedProcessing}
        isSepa={isSepa}
      />
    </Elements>
  );
}
