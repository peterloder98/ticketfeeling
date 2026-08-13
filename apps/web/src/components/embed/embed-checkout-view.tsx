"use client";

import { useEffect, useState } from "react";
import { cartFetch } from "@/lib/commerce/cart-client";
import { formatEuroFromCents } from "@/lib/money";
import { CheckoutForm } from "@/components/checkout-form";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { CartOrderSummary } from "@/components/cart-order-summary";
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
    unitListGrossCents?: number;
    priceCampaignName?: string | null;
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
    discountCents?: number;
    discountLabel?: string | null;
    orderCampaignDisclaimer?: string | null;
    feeGrossCents?: number;
    feeLabel?: string | null;
    feeCustomerDescription?: string | null;
    administrationFeePercentageBasisPoints?: number;
    giftCardAppliedCents?: number;
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
            data.items.map((item) => {
              const listUnit = item.unitListGrossCents || item.unitPriceGrossCents;
              return {
                quantity: item.quantity,
                categoryLabel: item.categoryName,
                unitPriceCents: item.unitPriceGrossCents,
                lineGrossCents: item.quantity * item.unitPriceGrossCents,
                lineListCents: item.quantity * listUnit,
                priceCampaignName: item.priceCampaignName,
                eventKey: item.eventName,
                eventName: item.eventName,
                eventStartsAt: item.eventStartsAt,
                locationName: item.locationName,
                locationCity: item.locationCity,
              };
            }),
          ).map((line, idx) => {
            const onUnitSale =
              typeof line.lineListCents === "number" &&
              line.lineListCents > line.lineGrossCents;
            return (
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
                  {onUnitSale && line.priceCampaignName ? (
                    <span className="mt-0.5 block text-[11px] font-medium text-[var(--tf-teal-hover)]">
                      {line.priceCampaignName}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  {onUnitSale ? (
                    <span className="block text-[11px] tabular-nums text-[var(--tf-text-secondary)] line-through">
                      {formatEuroFromCents(line.lineListCents!)}
                    </span>
                  ) : null}
                  <span className="tabular-nums font-medium">
                    {formatEuroFromCents(line.lineGrossCents)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 border-t border-[var(--tf-line)] pt-2">
          <CartOrderSummary
            compact
            ticketsGrossCents={data.summary?.ticketsGrossCents ?? data.customerTotalCents}
            discountCents={data.summary?.discountCents ?? 0}
            discountLabel={data.summary?.discountLabel}
            orderCampaignDisclaimer={data.summary?.orderCampaignDisclaimer}
            feeGrossCents={data.summary?.feeGrossCents ?? 0}
            feeLabel={data.summary?.feeLabel ?? "Verwaltungsgebühr"}
            feeCustomerDescription={data.summary?.feeCustomerDescription}
            administrationFeePercentageBasisPoints={
              data.summary?.administrationFeePercentageBasisPoints ??
              DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS
            }
            giftCardAppliedCents={data.summary?.giftCardAppliedCents ?? 0}
            grossCents={data.customerTotalCents}
          />
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
