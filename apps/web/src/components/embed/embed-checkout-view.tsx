"use client";

import { useEffect, useState } from "react";
import { cartFetch } from "@/lib/commerce/cart-client";
import { formatEuroFromCents } from "@/lib/money";
import { CheckoutForm } from "@/components/checkout-form";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { useCart } from "@/components/cart-context";
import type { CheckoutPaymentOption } from "@/lib/commerce/payment-fees";

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
  summary: { grossCents: number; grossFormatted?: string | null } | null;
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
          {data.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2 text-xs">
              <span className="min-w-0 text-[var(--tf-navy)]">
                {item.quantity}× {item.categoryName}
                <span className="mt-0.5 block font-medium">{item.eventName}</span>
                <CartItemEventMeta
                  eventStartsAt={item.eventStartsAt}
                  locationName={item.locationName}
                  locationCity={item.locationCity}
                />
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {formatEuroFromCents(item.quantity * item.unitPriceGrossCents)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-[var(--tf-line)] pt-2 text-sm font-semibold text-[var(--tf-navy)]">
          <span>Gesamtbetrag</span>
          <span className="tabular-nums">
            {formatEuroFromCents(data.customerTotalCents)}
          </span>
        </p>
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
