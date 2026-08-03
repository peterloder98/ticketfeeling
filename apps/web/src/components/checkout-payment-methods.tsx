"use client";

import { useEffect, useState } from "react";
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

function detectWalletSupport(): Promise<{ apple_pay: boolean; google_pay: boolean }> {
  if (typeof window === "undefined" || !window.PaymentRequest) {
    return Promise.resolve({ apple_pay: false, google_pay: false });
  }
  try {
    const apple = new PaymentRequest(
      [{ supportedMethods: "https://apple.com/apple-pay" }],
      { total: { label: "Ticketfeeling", amount: { currency: "EUR", value: "1.00" } } },
    );
    const google = new PaymentRequest(
      [
        {
          supportedMethods: "https://google.com/pay",
          data: {
            environment: "TEST",
            apiVersion: 2,
            apiVersionMinor: 0,
            allowedPaymentMethods: [
              {
                type: "CARD",
                parameters: {
                  allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
                  allowedCardNetworks: ["VISA", "MASTERCARD"],
                },
              },
            ],
          },
        },
      ],
      { total: { label: "Ticketfeeling", amount: { currency: "EUR", value: "1.00" } } },
    );
    return Promise.all([
      apple.canMakePayment().catch(() => false),
      google.canMakePayment().catch(() => false),
    ]).then(([apple_pay, google_pay]) => ({
      apple_pay: Boolean(apple_pay),
      google_pay: Boolean(google_pay),
    }));
  } catch {
    return Promise.resolve({ apple_pay: false, google_pay: false });
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
  const [wallets, setWallets] = useState<{ apple_pay: boolean; google_pay: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    detectWalletSupport().then((result) => {
      if (!cancelled) setWallets(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleOptions = options
    .filter((option) => {
      if (!option.visible) return false;
      if (option.key === "apple_pay" && wallets && !wallets.apple_pay) return false;
      if (option.key === "google_pay" && wallets && !wallets.google_pay) return false;
      // Until detection finishes, hide wallets to avoid flash of unavailable options
      if (option.wallet && wallets === null) return false;
      return true;
    })
    // SEPA first so the default selection is immediately visible at the top.
    .sort((a, b) => {
      if (a.key === "sepa_debit") return -1;
      if (b.key === "sepa_debit") return 1;
      return 0;
    });

  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold text-[var(--tf-navy)]">
        Zahlungsart auswählen <span className="text-[var(--danger)]">*</span>
      </legend>
      <p className="text-sm text-[var(--tf-text-secondary)]">
        Gesamtbetrag bleibt{" "}
        <strong className="text-[var(--tf-navy)]">{formatEuroFromCents(customerTotalCents)}</strong>
        . Die gewählte Zahlungsart verändert den Gesamtpreis nicht.
      </p>

      <div className="space-y-3" role="radiogroup" aria-required="true" aria-label="Zahlungsart">
        {visibleOptions.map((option) => {
          const selected = value === option.key;
          const disabled = !option.selectable;
          return (
            <label
              key={option.key}
              data-field="paymentMethod"
              className={`flex cursor-pointer gap-3 rounded-[18px] border px-4 py-4 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--tf-teal)] ${
                disabled
                  ? "cursor-not-allowed border-[var(--tf-line)] bg-[rgba(15,39,71,0.02)] opacity-80"
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
                className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--tf-teal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-semibold text-[var(--tf-navy)] ${
                          option.key === "sepa_debit" ? "text-base md:text-lg" : "text-base"
                        }`}
                      >
                        {option.title}
                      </span>
                      {option.recommendedBadgeText ? (
                        <span className="rounded-md bg-[rgba(20,184,166,0.18)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--tf-teal-hover)]">
                          {option.recommendedBadgeText}
                        </span>
                      ) : null}
                      {option.badge === "test" ? (
                        <span className="rounded-md bg-[rgba(245,158,11,0.15)] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">
                          Testmodus
                        </span>
                      ) : null}
                      {option.badge === "soon" ? (
                        <span className="rounded-md bg-[rgba(15,39,71,0.06)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tf-text-secondary)]">
                          Demnächst verfügbar
                        </span>
                      ) : null}
                      {option.badge === "unavailable" ? (
                        <span className="rounded-md bg-[rgba(15,39,71,0.06)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tf-text-secondary)]">
                          Nicht verfügbar
                        </span>
                      ) : null}
                    </span>
                    {option.subtitle ? (
                      <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                        {option.subtitle}
                        {option.key === "sepa_debit" ? " · sichere Abwicklung über Stripe" : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">{brandsForMethod(option.key)}</span>
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed text-[var(--tf-text-secondary)]">
                  {option.description}
                </span>
                {option.hint ? (
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--tf-text-secondary)]">
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
