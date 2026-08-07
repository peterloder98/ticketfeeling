"use client";

import { useEffect, useState } from "react";
import { cartFetch } from "@/lib/commerce/cart-client";
import { formatEuroFromCents } from "@/lib/money";
import { CheckoutForm } from "@/components/checkout-form";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { FeeInfoDialog } from "@/components/fee-info-dialog";
import { useCart } from "@/components/cart-context";
import type { CheckoutPaymentOption } from "@/lib/commerce/payment-fees";
import { mergeSameCategoryLines } from "@/lib/commerce/merge-category-lines";
import { DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS } from "@/lib/commerce/platform-fee";

type Bootstrap = {
  empty: boolean;
  sessionKey: string | null;
  expiresAt?: string | Date | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPriceGrossCents: number;
    categoryName: string;
    eventName: string;
    eventSlug?: string;
    eventStartsAt?: string | Date | null;
    locationName?: string | null;
    locationCity?: string | null;
  }>;
  summary: {
    grossCents: number;
    grossFormatted?: string | null;
    ticketsGrossCents?: number;
    feeGrossCents?: number;
    feeLabel?: string | null;
    feeCustomerDescription?: string | null;
    administrationFeePercentageBasisPoints?: number;
  } | null;
  paymentOptions: CheckoutPaymentOption[];
  customerTotalCents: number;
  isLoggedIn: boolean;
  isStaff: boolean;
  loginEmail: string | null;
};

export function EmbedCheckoutView() {
  const { bump } = useCart();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await cartFetch("/api/v1/checkout/bootstrap");
        if (!response.ok) {
          if (!cancelled) setError("Kasse konnte nicht geladen werden.");
          return;
        }
        const json = (await response.json()) as Bootstrap;
        if (cancelled) return;
        setData(json);
        bump({
          itemCount: json.empty ? 0 : json.items.reduce((s, i) => s + i.quantity, 0),
          grossFormatted: json.summary?.grossFormatted ?? null,
          expiresAt: json.expiresAt ? new Date(json.expiresAt).toISOString() : null,
          sessionKey: json.sessionKey,
        });
      } catch {
        if (!cancelled) setError("Kasse konnte nicht geladen werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bump]);

  if (error) {
    return (
      <p className="py-6 text-center text-sm text-[var(--tf-text-secondary)]">
        {error}{" "}
        <EmbedBackLink fallbackHref="/embed/warenkorb" label="Zurück zum Warenkorb" />
      </p>
    );
  }

  if (!data) {
    return (
      <p className="py-6 text-center text-sm text-[var(--tf-text-secondary)]">
        Kasse wird geladen…
      </p>
    );
  }

  if (data.empty) {
    return (
      <p className="py-6 text-center text-sm text-[var(--tf-text-secondary)]">
        Warenkorb leer.{" "}
        <EmbedBackLink fallbackHref="/embed/shop" label="Zurück zum Shop" className="font-medium" />
      </p>
    );
  }

  const expiresAt =
    typeof data.expiresAt === "string"
      ? data.expiresAt
      : data.expiresAt
        ? new Date(data.expiresAt).toISOString()
        : null;

  const eventHref = data.items[0]?.eventSlug
    ? `/embed/event/${data.items[0].eventSlug}`
    : "/embed/shop";

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Zur Kasse</h1>
        <EmbedBackLink fallbackHref="/embed/warenkorb" label="Zurück zum Warenkorb" />
      </div>

      {expiresAt ? <CartCountdownDisplay expiresAt={expiresAt} eventHref={eventHref} /> : null}

      <div className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
          Bestellung
        </p>
        <ul className="mt-2 space-y-2">
          {mergeSameCategoryLines(
            data.items.map((item) => ({
              quantity: item.quantity,
              categoryLabel: item.categoryName,
              unitPriceCents: item.unitPriceGrossCents,
              lineGrossCents: item.quantity * item.unitPriceGrossCents,
              eventKey: item.eventName,
              eventName: item.eventName,
              eventStartsAt: item.eventStartsAt,
              locationName: item.locationName,
              locationCity: item.locationCity,
            })),
          ).map((line, idx) => (
            <li
              key={`${line.eventKey}-${line.categoryLabel}-${line.unitPriceCents}-${idx}`}
              className="flex justify-between gap-2 text-xs"
            >
              <span className="min-w-0 text-[var(--tf-navy)]">
                {line.quantity}× {line.categoryLabel}
                <span className="mt-0.5 block font-medium">{line.eventName}</span>
                <CartItemEventMeta
                  eventStartsAt={line.eventStartsAt}
                  locationName={line.locationName}
                  locationCity={line.locationCity}
                />
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {formatEuroFromCents(line.lineGrossCents)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1.5 border-t border-[var(--tf-line)] pt-2 text-xs">
          {typeof data.summary?.ticketsGrossCents === "number" ? (
            <p className="flex justify-between gap-3 text-[var(--tf-text-secondary)]">
              <span>Tickets</span>
              <span className="tabular-nums">
                {formatEuroFromCents(data.summary.ticketsGrossCents)}
              </span>
            </p>
          ) : null}
          {(data.summary?.feeGrossCents ?? 0) > 0 ? (
            <div className="space-y-1.5">
              <p className="flex justify-between gap-3 text-[var(--tf-text-secondary)]">
                <span>{data.summary?.feeLabel ?? "Verwaltungsgebühr"}</span>
                <span className="tabular-nums">
                  {formatEuroFromCents(data.summary!.feeGrossCents!)}
                </span>
              </p>
              <FeeInfoDialog
                feePercentageBasisPoints={
                  data.summary?.administrationFeePercentageBasisPoints ??
                  DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS
                }
                description={data.summary?.feeCustomerDescription}
              />
            </div>
          ) : null}
          <p className="flex justify-between gap-3 pt-1 text-sm font-semibold text-[var(--tf-navy)]">
            <span>Gesamtbetrag</span>
            <span className="tabular-nums">
              {formatEuroFromCents(data.customerTotalCents)}
            </span>
          </p>
        </div>
      </div>

      <CheckoutForm
        isLoggedIn={data.isLoggedIn}
        isStaff={data.isStaff}
        loginEmail={data.loginEmail}
        paymentOptions={data.paymentOptions}
        customerTotalCents={data.customerTotalCents}
        embed
        eventHref={eventHref}
      />
    </div>
  );
}
