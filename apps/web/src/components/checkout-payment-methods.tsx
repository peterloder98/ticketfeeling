"use client";

import type { CheckoutPaymentOption, PaymentMethodKey } from "@/lib/commerce/payment-fees";
import { formatEuroFromCents } from "@/lib/money";
import {
  ApplePayMark,
  GooglePayMark,
  MastercardMark,
  SepaMark,
  VisaMark,
} from "@/components/payment-brand-marks";

function brandsForMethod(key: PaymentMethodKey) {
  switch (key) {
    case "card":
      return (
        <>
          <VisaMark />
          <MastercardMark />
        </>
      );
    case "apple_pay":
      return <ApplePayMark />;
    case "google_pay":
      return <GooglePayMark />;
    case "sepa_debit":
      return <SepaMark />;
    default:
      return null;
  }
}

export function CheckoutPaymentMethods({
  options,
  value,
  onChange,
  customerTotalCents,
}: {
  options: CheckoutPaymentOption[];
  value: PaymentMethodKey | null;
  onChange: (key: PaymentMethodKey) => void;
  customerTotalCents: number;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold text-[var(--tf-navy)]">
        Bitte wähle deine Zahlungsart
      </legend>
      <p className="text-sm text-[var(--tf-text-secondary)]">
        Gesamtbetrag bleibt{" "}
        <strong className="text-[var(--tf-navy)]">{formatEuroFromCents(customerTotalCents)}</strong>{" "}
        — unabhängig von der Zahlungsart.
      </p>

      <div className="space-y-3" role="radiogroup" aria-label="Zahlungsart">
        {options.map((option) => {
          const selected = value === option.key;
          const disabled = !option.selectable;
          return (
            <label
              key={option.key}
              className={`flex cursor-pointer gap-3 rounded-[18px] border px-4 py-4 transition ${
                disabled
                  ? "cursor-not-allowed border-[var(--tf-line)] bg-[rgba(15,39,71,0.02)] opacity-75"
                  : selected
                    ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] shadow-[0_0_0_1px_var(--tf-teal)]"
                    : "border-[var(--tf-line)] bg-white hover:border-[var(--tf-teal)]/50"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option.key}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.key)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--tf-teal)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--tf-navy)]">{option.title}</span>
                    {option.badge === "test" ? (
                      <span className="rounded-full bg-[rgba(245,158,11,0.15)] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">
                        Testmodus
                      </span>
                    ) : null}
                    {option.badge === "soon" ? (
                      <span className="rounded-full bg-[rgba(15,39,71,0.06)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tf-text-secondary)]">
                        Demnächst verfügbar
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {brandsForMethod(option.key)}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-[var(--tf-text-secondary)]">
                  {option.description}
                </span>
                {option.hint ? (
                  <span className="mt-1 block text-xs text-[var(--tf-text-secondary)]">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <p className="pt-1 text-center text-xs text-[var(--tf-text-secondary)]">
        Sichere Zahlungsabwicklung über Stripe.
      </p>
    </fieldset>
  );
}
