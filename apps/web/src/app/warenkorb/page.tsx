import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { findOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";
import { CartRemoveButton } from "@/components/cart-remove-button";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";
import { CartOrderSummary } from "@/components/cart-order-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warenkorb" };

export default async function CartPage() {
  const [session, sessionKey] = await Promise.all([getSession(), readCartSessionKey()]);
  const cart = sessionKey
    ? await findOpenCart({ userId: session?.user?.id, sessionKey })
    : null;
  const items = cart?.items ?? [];
  const summary = cart ? await priceCart(cart) : null;
  const scrubHint =
    cart &&
    typeof (cart as unknown as { seatScrubHint?: unknown }).seatScrubHint ===
      "string"
      ? (cart as unknown as { seatScrubHint: string }).seatScrubHint
      : null;

  return (
    <div className="tf-container py-12">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
        Warenkorb
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Tickets sind 10 Minuten für dich reserviert.
      </p>
      {scrubHint ? (
        <p
          className="mt-4 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-surface)] px-4 py-3 text-sm text-[var(--tf-navy)]"
          role="status"
        >
          {scrubHint}
        </p>
      ) : null}
      {items.length > 0 && cart ? (
        <div className="mt-5">
          <CartCountdownDisplay
            expiresAt={cart.expiresAt.toISOString()}
            eventHref={
              items[0]?.category.event.slug
                ? `/event/${items[0].category.event.slug}`
                : "/events"
            }
          />
        </div>
      ) : null}

      <div className="mt-8 space-y-3">
        {items.map((item) => {
          const listUnit = item.unitListGrossCents || item.unitPriceGrossCents;
          const onUnitSale = listUnit > item.unitPriceGrossCents;
          const lineList = item.quantity * listUnit;
          const linePaid = item.quantity * item.unitPriceGrossCents;
          return (
            <div key={item.id} className="tf-card flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--tf-navy)]">
                  {item.quantity}× {item.category.name}
                </p>
                <p className="mt-0.5 text-sm font-medium text-[var(--tf-navy)]">
                  {item.category.event.name}
                </p>
                <CartItemEventMeta
                  eventStartsAt={item.category.event.eventStartsAt}
                  locationName={item.category.event.location?.name}
                  locationCity={item.category.event.location?.city}
                />
                {onUnitSale && item.priceCampaignName ? (
                  <p className="mt-1 text-xs font-medium text-[var(--tf-teal-hover)]">
                    {item.priceCampaignName}
                  </p>
                ) : null}
                {item.category.categoryKind === "wheelchair" && item.category.companionFree ? (
                  <p className="mt-1 text-xs font-medium text-[var(--tf-teal-hover)]">
                    Inkl. Begleitperson kostenfrei
                  </p>
                ) : null}
                {item.seats.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-sm text-[var(--tf-teal-hover)]">
                    {item.seats.map((s, idx) => (
                      <li key={s.id}>
                        {s.blockLabel} · Reihe {s.rowLabel} · Platz {s.seatNumber}
                        {item.category.categoryKind === "wheelchair" &&
                        item.category.companionFree &&
                        idx % 2 === 1
                          ? " (Begleitung)"
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : item.seatingMode === "best_available" ? (
                  <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">Bestplätze reserviert</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  {onUnitSale ? (
                    <p className="text-xs tabular-nums text-[var(--tf-text-secondary)] line-through">
                      {formatEuroFromCents(lineList)}
                    </p>
                  ) : null}
                  <p className="font-medium tabular-nums">{formatEuroFromCents(linePaid)}</p>
                </div>
                <CartRemoveButton itemId={item.id} />
              </div>
            </div>
          );
        })}
        {items.length === 0 ? (
          <div className="tf-card mt-2 space-y-4 p-6 text-center sm:text-left">
            <p className="text-base text-[var(--tf-text-secondary)]">
              Ihr Warenkorb ist noch leer.
            </p>
            <Link href="/events" className="tf-btn tf-btn-primary inline-flex">
              Events entdecken
            </Link>
          </div>
        ) : null}
      </div>

      {items.length > 0 && summary ? (
        <div className="tf-card mt-6 flex flex-wrap items-center justify-between gap-3">
          <CartOrderSummary
            ticketsGrossCents={summary.ticketsGrossCents}
            discountCents={summary.discountCents}
            discountLabel={summary.discountLabel}
            orderCampaignDisclaimer={summary.orderCampaignDisclaimer}
            feeGrossCents={summary.feeGrossCents}
            feeLabel={summary.feeLabel}
            feeCustomerDescription={summary.feeCustomerDescription}
            administrationFeePercentageBasisPoints={
              summary.administrationFeePercentageBasisPoints
            }
            giftCardAppliedCents={summary.giftCardAppliedCents}
            grossCents={summary.grossCents}
          />
          <Link href="/checkout" className="tf-btn tf-btn-primary">
            Zur Kasse
          </Link>
        </div>
      ) : null}
    </div>
  );
}
