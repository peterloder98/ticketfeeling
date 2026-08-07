"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cartFetch } from "@/lib/commerce/cart-client";
import { formatEuroFromCents } from "@/lib/money";
import { CartRemoveButton } from "@/components/cart-remove-button";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { useCart } from "@/components/cart-context";
import { FeeInfoDialog, FeeInfoIconButton } from "@/components/fee-info-dialog";
import { DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS } from "@/lib/commerce/platform-fee";

type CartItem = {
  id: string;
  quantity: number;
  unitPriceGrossCents: number;
  categoryName: string;
  eventName: string;
  eventSlug: string;
  eventStartsAt?: string | Date | null;
  locationName?: string | null;
  locationCity?: string | null;
  seats?: Array<{
    id: string;
    blockLabel: string | null;
    rowLabel: string | null;
    seatNumber: string | null;
  }>;
};

type CartPayload = {
  expiresAt: string | null;
  sessionKey: string | null;
  summary: {
    itemCount: number;
    ticketsGrossCents?: number;
    feeGrossCents?: number;
    feeLabel?: string | null;
    feeCustomerDescription?: string | null;
    administrationFeePercentageBasisPoints?: number;
    grossCents?: number;
    grossFormatted?: string | null;
  };
  items: CartItem[];
};

/**
 * Client cart for embed iframes — uses sessionStorage + x-cart-session so we
 * still see items when the HttpOnly cookie is missing or wrong.
 */
export function EmbedCartView() {
  const { bump, refresh } = useCart();
  const [data, setData] = useState<CartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await cartFetch("/api/v1/cart");
      if (!response.ok) {
        setError("Warenkorb konnte nicht geladen werden.");
        setData(null);
        return;
      }
      const json = (await response.json()) as CartPayload;
      setData(json);
      bump({
        itemCount: json.summary?.itemCount ?? 0,
        grossFormatted: json.summary?.grossFormatted ?? null,
        expiresAt: json.expiresAt,
        sessionKey: json.sessionKey,
      });
    } catch {
      setError("Warenkorb konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [bump]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const backToEventSlug = items[0]?.eventSlug;
  const backHref = backToEventSlug ? `/embed/event/${backToEventSlug}` : "/embed/shop";

  if (loading && !data) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Warenkorb</h1>
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-6 text-center text-[var(--tf-text-secondary)]">
          Warenkorb wird geladen…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Warenkorb</h1>
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-6 text-center text-[var(--tf-text-secondary)]">
          {error}
          <button type="button" className="mt-2 block w-full text-[var(--tf-teal)] underline" onClick={() => void load()}>
            Erneut versuchen
          </button>
        </p>
      </div>
    );
  }

  const tickets = data?.summary?.ticketsGrossCents ?? 0;
  const fee = data?.summary?.feeGrossCents ?? 0;
  const feeLabel = data?.summary?.feeLabel ?? "Gebühren";
  const gross = data?.summary?.grossCents ?? 0;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Warenkorb</h1>
        <EmbedBackLink
          fallbackHref={backHref}
          label={backToEventSlug ? "Zurück zum Event" : "Zurück"}
        />
      </div>

      {items.length > 0 && data?.expiresAt ? (
        <CartCountdownDisplay expiresAt={data.expiresAt} />
      ) : null}

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--tf-navy)]">
                  {item.quantity}× {item.categoryName}
                </p>
                <p className="mt-0.5 text-xs font-medium text-[var(--tf-navy)]">{item.eventName}</p>
                <CartItemEventMeta
                  eventStartsAt={item.eventStartsAt}
                  locationName={item.locationName}
                  locationCity={item.locationCity}
                />
                {item.seats && item.seats.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--tf-teal-hover)]">
                    {item.seats.map((s) => (
                      <li key={s.id}>
                        {s.blockLabel} · R{s.rowLabel} · Pl. {s.seatNumber}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium tabular-nums">
                  {formatEuroFromCents(item.quantity * item.unitPriceGrossCents)}
                </p>
                <div className="mt-1">
                  <CartRemoveButton
                    itemId={item.id}
                    onRemoved={() => {
                      void load();
                      void refresh({ full: true });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-6 text-center text-[var(--tf-text-secondary)]">
            Warenkorb ist leer.
            <span className="mt-2 flex justify-center">
              <EmbedBackLink fallbackHref="/embed/shop" label="Zurück zum Shop" />
            </span>
          </p>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--tf-line)] p-3">
          <div className="space-y-1 text-xs">
            <p className="flex justify-between gap-3">
              <span className="text-[var(--tf-text-secondary)]">Tickets</span>
              <span className="tabular-nums">{formatEuroFromCents(tickets)}</span>
            </p>
            {fee > 0 ? (
              <div className="space-y-1">
                <p className="flex justify-between gap-3">
                  <span className="inline-flex items-center gap-1 text-[var(--tf-text-secondary)]">
                    <span>{feeLabel}</span>
                    <FeeInfoIconButton
                      feePercentageBasisPoints={
                        data?.summary?.administrationFeePercentageBasisPoints ??
                        DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS
                      }
                      className="-m-0.5 p-0.5"
                    />
                  </span>
                  <span className="tabular-nums">{formatEuroFromCents(fee)}</span>
                </p>
                <FeeInfoDialog
                  feePercentageBasisPoints={
                    data?.summary?.administrationFeePercentageBasisPoints ??
                    DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS
                  }
                  description={data?.summary?.feeCustomerDescription}
                />
              </div>
            ) : null}
            <p className="flex justify-between gap-3 pt-1 text-base font-semibold text-[var(--tf-navy)]">
              <span>Gesamt</span>
              <span className="tabular-nums">{formatEuroFromCents(gross)}</span>
            </p>
          </div>
          <Link href="/embed/checkout" className="tf-btn tf-btn-primary w-full !min-h-11">
            Zur Kasse
          </Link>
        </div>
      ) : null}
    </div>
  );
}
