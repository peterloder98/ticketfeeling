import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";
import { CheckoutForm } from "@/components/checkout-form";
import { PromoCodeForm } from "@/components/promo-code-form";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildSellerIdentity } from "@/lib/legal/seller";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  buildCheckoutPaymentOptions,
  parsePaymentFeeConfig,
  parsePaymentUiConfig,
} from "@/lib/commerce/payment-fees";
import { isSepaDisabledForCheckout } from "@/lib/commerce/sepa-availability";
import { getPaymentProvider } from "@/lib/payments";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zur Kasse" };

export default async function CheckoutPage() {
  const session = await getServerSession(authOptions);
  const sessionKey = await readCartSessionKey();
  const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
  const summary = await priceCart(cart);
  const org = await getDefaultOrganization();
  const seller = buildSellerIdentity(org!, org?.settings);
  const feeConfig = parsePaymentFeeConfig(org?.settings?.paymentFeeConfig);
  const uiConfig = parsePaymentUiConfig(org?.settings?.paymentUiConfig);
  const sepaDisabled = isSepaDisabledForCheckout({
    orgSepaMinDays: org?.settings?.sepaMinDaysBeforeEvent ?? uiConfig.sepaMinDaysBeforeEvent,
    items: cart.items.map((item) => ({
      eventStartsAt: item.category.event.eventStartsAt,
      eventSepaMinDays: item.category.event.sepaMinDaysBeforeEvent,
    })),
  });
  const stripeLiveConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PUBLISHABLE_KEY &&
      getPaymentProvider().key === "stripe",
  );
  const paymentOptions = buildCheckoutPaymentOptions({
    customerTotalCents: summary.grossCents,
    config: feeConfig,
    ui: uiConfig,
    stripeLiveConfigured,
    allowDevTestCheckout: getPaymentProvider().key === "dev",
    sepaDisabled,
  });
  const feePercentLabel =
    summary.administrationFeePercentageBasisPoints > 0
      ? (summary.administrationFeePercentageBasisPoints / 100)
          .toFixed(summary.administrationFeePercentageBasisPoints % 100 === 0 ? 0 : 2)
          .replace(".", ",")
      : null;

  let isStaff = false;
  if (session?.user?.id) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership) {
      isStaff =
        (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell"));
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="tf-container py-12">
        <p className="text-[var(--tf-text-secondary)]">
          Dein Warenkorb ist leer.{" "}
          <Link href="/events" className="font-medium text-[var(--tf-teal-hover)] underline">
            Events entdecken
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
      <div className="tf-container grid gap-8 py-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:gap-12 lg:py-14 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
              Ticketfeeling
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--tf-navy)] md:text-4xl">
              Zur Kasse
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)] md:text-base">
              {isStaff
                ? "Testkauf: am besten als Gast — dann bist du nicht als Admin unterwegs."
                : session?.user
                  ? "Angemeldet — Daten prüfen und bestellen."
                  : "Als Gast oder mit schnellem Konto — du entscheidest."}
            </p>
          </div>

          <CheckoutForm
            isLoggedIn={Boolean(session?.user)}
            isStaff={isStaff}
            loginEmail={session?.user?.email}
            paymentOptions={paymentOptions}
            customerTotalCents={summary.grossCents}
            eventHref={
              cart.items[0]?.category.event.slug
                ? `/event/${cart.items[0].category.event.slug}`
                : "/events"
            }
          />
        </div>

        <aside className="h-fit space-y-3 lg:sticky lg:top-28">
          <CartCountdownDisplay
            expiresAt={cart.expiresAt.toISOString()}
            eventHref={
              cart.items[0]?.category.event.slug
                ? `/event/${cart.items[0].category.event.slug}`
                : "/events"
            }
          />
          <div className="rounded-[20px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.05)] md:p-6">
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Zusammenfassung</h2>

            <ul className="mt-4 space-y-4">
              {cart.items.map((item) => {
                const ev = item.category.event;
                return (
                  <li
                    key={item.id}
                    className="border-b border-[var(--tf-line)] pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--tf-navy)]">
                          {item.quantity}× {item.category.name}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-[var(--tf-navy)]">
                          {ev.name}
                        </p>
                        <CartItemEventMeta
                          eventStartsAt={ev.eventStartsAt}
                          locationName={ev.location?.name}
                          locationCity={ev.location?.city}
                        />
                        {item.category.categoryKind === "wheelchair" &&
                        item.category.companionFree ? (
                          <p className="mt-1 text-xs font-medium text-[var(--tf-teal-hover)]">
                            Inkl. Begleitperson kostenfrei
                          </p>
                        ) : null}
                        {item.seats.length > 0 ? (
                          <ul className="mt-1.5 space-y-0.5 text-xs font-medium text-[var(--tf-teal-hover)]">
                            {item.seats.map((s, idx) => (
                              <li key={s.id}>
                                {s.blockLabel} · R{s.rowLabel} · Pl. {s.seatNumber}
                                {item.category.categoryKind === "wheelchair" &&
                                item.category.companionFree &&
                                idx % 2 === 1
                                  ? " (Begleitung)"
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums text-[var(--tf-navy)]">
                        {formatEuroFromCents(item.quantity * item.unitPriceGrossCents)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 space-y-2 border-t border-[var(--tf-line)] pt-4 text-sm">
              <p className="flex justify-between gap-4 text-[var(--tf-text-secondary)]">
                <span>Tickets</span>
                <span className="tabular-nums">{formatEuroFromCents(summary.ticketsGrossCents)}</span>
              </p>
              {summary.discountCents > 0 ? (
                <p className="flex justify-between gap-4 text-[var(--tf-text-secondary)]">
                  <span>Rabatt</span>
                  <span className="tabular-nums">−{formatEuroFromCents(summary.discountCents)}</span>
                </p>
              ) : null}
              {summary.feeGrossCents > 0 ? (
                <p className="flex justify-between gap-4 text-[var(--tf-text-secondary)]">
                  <span>{summary.feeLabel}</span>
                  <span className="tabular-nums">{formatEuroFromCents(summary.feeGrossCents)}</span>
                </p>
              ) : null}
              {summary.giftCardAppliedCents > 0 ? (
                <p className="flex justify-between gap-4 text-[var(--tf-teal-hover)]">
                  <span>Gutschein</span>
                  <span className="tabular-nums">
                    −{formatEuroFromCents(summary.giftCardAppliedCents)}
                  </span>
                </p>
              ) : null}
              <div className="border-t border-[var(--tf-line)] pt-3">
                <p className="flex justify-between gap-4 text-lg font-semibold text-[var(--tf-navy)]">
                  <span>Gesamt</span>
                  <span className="tabular-nums">{formatEuroFromCents(summary.grossCents)}</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                  inkl. gesetzlicher Umsatzsteuer
                  <br />
                  {summary.feeGrossCents > 0 ? (
                    <>
                      Verwaltungsgebühr{feePercentLabel ? ` ${feePercentLabel} %` : ""}{" "}
                      {formatEuroFromCents(summary.feeGrossCents)}
                    </>
                  ) : (
                    <>keine Verwaltungsgebühr</>
                  )}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                  Die gewählte Zahlungsart verändert den Gesamtpreis nicht.
                </p>
                {feePercentLabel ? (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                    Unsere Verwaltungsgebühr beträgt nur {feePercentLabel}&nbsp;% und bleibt
                    unabhängig von der Zahlungsart gleich. Damit halten wir den Ticketservice
                    bewusst transparent und deutlich günstiger als viele klassische Ticketanbieter.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              <PromoCodeForm
                variant="compact"
                initialDiscount={cart.discountCode}
                initialGift={cart.giftCardCode}
              />
            </div>

            <p className="mt-5 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
              Anbieter: {seller.tradeName || "Ticketfeeling"}
              {" · "}
              <Link
                href="/recht/impressum"
                className="underline underline-offset-2 hover:text-[var(--tf-navy)]"
              >
                Impressum
              </Link>
            </p>
          </div>

          <p className="mt-3 px-1 text-center text-xs text-[var(--tf-text-secondary)] lg:text-left">
            Mit „Zahlungspflichtig bestellen“ schließt du den Kauf ab.
          </p>
        </aside>
      </div>
    </div>
  );
}
