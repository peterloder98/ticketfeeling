import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";
import { CheckoutForm } from "@/components/checkout-form";
import { PromoCodeForm } from "@/components/promo-code-form";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildSellerIdentity } from "@/lib/legal/seller";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import {
  buildCheckoutPaymentOptions,
  parsePaymentFeeConfig,
  parsePaymentUiConfig,
} from "@/lib/commerce/payment-fees";
import { isSepaDisabledForCheckout } from "@/lib/commerce/sepa-availability";
import { getPaymentProvider } from "@/lib/payments";
import { isStripeTestMode } from "@/lib/payments/mode";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";
import { CartItemEventMeta } from "@/components/cart-item-event-meta";
import { FeeInfoDialog, FeeInfoIconButton } from "@/components/fee-info-dialog";
import { feePercentNumberLabel } from "@/lib/commerce/platform-fee";
import { mergeSameCategoryLines } from "@/lib/commerce/merge-category-lines";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zur Kasse" };

export default async function CheckoutPage() {
  const [session, sessionKey, org] = await Promise.all([
    getSession(),
    readCartSessionKey(),
    getDefaultOrganization(),
  ]);
  const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
  const summary = await priceCart(cart);
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
  const providerKey = getPaymentProvider().key;
  const stripeTest = isStripeTestMode();
  const stripeLiveConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PUBLISHABLE_KEY &&
      providerKey === "stripe" &&
      !stripeTest,
  );
  const paymentOptions = buildCheckoutPaymentOptions({
    customerTotalCents: summary.grossCents,
    config: feeConfig,
    ui: uiConfig,
    stripeLiveConfigured,
    allowDevTestCheckout: providerKey === "dev" || stripeTest,
    sepaDisabled,
  });
  const feePercentLabel =
    summary.administrationFeePercentageBasisPoints > 0
      ? feePercentNumberLabel(summary.administrationFeePercentageBasisPoints)
      : null;

  let isStaff = false;
  if (session?.user?.id) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership) {
      const keys = await getUserPermissionKeys(session.user.id, membership.organizationId);
      isStaff =
        keys.has("events:write") || keys.has("org:write") || keys.has("box_office:sell");
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
      <div className="tf-container grid items-start gap-8 py-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:gap-12 lg:py-14 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)]">
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

        <aside className="h-fit w-full self-start space-y-3 lg:sticky lg:top-28">
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
              {mergeSameCategoryLines(
                cart.items.map((item) => {
                  const ev = item.category.event;
                  const listUnit = item.unitListGrossCents || item.unitPriceGrossCents;
                  return {
                    quantity: item.quantity,
                    categoryLabel: item.category.name,
                    unitPriceCents: item.unitPriceGrossCents,
                    unitListCents: listUnit,
                    lineGrossCents: item.quantity * item.unitPriceGrossCents,
                    lineListCents: item.quantity * listUnit,
                    priceCampaignName: item.priceCampaignName,
                    eventKey: item.eventId,
                    eventName: ev.name,
                    eventStartsAt: ev.eventStartsAt,
                    locationName: ev.location?.name ?? null,
                    locationCity: ev.location?.city ?? null,
                    categoryKind: item.category.categoryKind,
                    companionFree: item.category.companionFree,
                    seats: item.seats,
                  };
                }),
              ).map((line, idx) => {
                const seats = Array.isArray(line.seats) ? line.seats : [];
                const onUnitSale =
                  typeof line.lineListCents === "number" &&
                  line.lineListCents > line.lineGrossCents;
                return (
                  <li
                    key={`${line.eventKey}-${line.categoryLabel}-${line.unitPriceCents}-${idx}`}
                    className="border-b border-[var(--tf-line)] pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--tf-navy)]">
                          {line.quantity}× {line.categoryLabel}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-[var(--tf-navy)]">
                          {line.eventName}
                        </p>
                        <CartItemEventMeta
                          eventStartsAt={line.eventStartsAt}
                          locationName={line.locationName}
                          locationCity={line.locationCity}
                        />
                        {onUnitSale && line.priceCampaignName ? (
                          <p className="mt-1 text-xs font-medium text-[var(--tf-teal-hover)]">
                            {line.priceCampaignName}
                          </p>
                        ) : null}
                        {line.categoryKind === "wheelchair" && line.companionFree ? (
                          <p className="mt-1 text-xs font-medium text-[var(--tf-teal-hover)]">
                            Inkl. Begleitperson kostenfrei
                          </p>
                        ) : null}
                        {seats.length > 0 ? (
                          <ul className="mt-1.5 space-y-0.5 text-xs font-medium text-[var(--tf-teal-hover)]">
                            {seats.map((s, seatIdx) => {
                              const seat = s as {
                                id: string;
                                blockLabel: string;
                                rowLabel: string;
                                seatNumber: string;
                              };
                              return (
                                <li key={seat.id}>
                                  {seat.blockLabel} · R{seat.rowLabel} · Pl. {seat.seatNumber}
                                  {line.categoryKind === "wheelchair" &&
                                  line.companionFree &&
                                  seatIdx % 2 === 1
                                    ? " (Begleitung)"
                                    : ""}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        {onUnitSale ? (
                          <p className="text-xs tabular-nums text-[var(--tf-text-secondary)] line-through">
                            {formatEuroFromCents(line.lineListCents)}
                          </p>
                        ) : null}
                        <p className="text-sm font-medium tabular-nums text-[var(--tf-navy)]">
                          {formatEuroFromCents(line.lineGrossCents)}
                        </p>
                      </div>
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
                <div className="space-y-0.5">
                  <p className="flex justify-between gap-4 font-medium text-[var(--tf-teal-hover)]">
                    <span>{summary.discountLabel?.trim() || "Rabatt"}</span>
                    <span className="tabular-nums">
                      −{formatEuroFromCents(summary.discountCents)}
                    </span>
                  </p>
                  {summary.orderCampaignDisclaimer ? (
                    <p className="text-[11px] font-normal text-[var(--tf-text-secondary)]">
                      {summary.orderCampaignDisclaimer}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {summary.feeGrossCents > 0 ? (
                <div className="space-y-1">
                  <p className="flex justify-between gap-4 text-[var(--tf-text-secondary)]">
                    <span className="inline-flex items-center gap-1">
                      <span>
                        {summary.feeLabel.includes("%")
                          ? summary.feeLabel
                          : `${summary.feeLabel}${feePercentLabel ? ` ${feePercentLabel} %` : ""}`}
                      </span>
                      <FeeInfoIconButton
                        feePercentageBasisPoints={summary.administrationFeePercentageBasisPoints}
                        className="-m-0.5 p-0.5"
                      />
                    </span>
                    <span className="tabular-nums">
                      {formatEuroFromCents(summary.feeGrossCents)}
                    </span>
                  </p>
                  <div className="pl-0">
                    <FeeInfoDialog
                      feePercentageBasisPoints={summary.administrationFeePercentageBasisPoints}
                      description={summary.feeCustomerDescription}
                    />
                  </div>
                </div>
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
                  <span>Gesamtbetrag</span>
                  <span className="tabular-nums">{formatEuroFromCents(summary.grossCents)}</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                  inkl. gesetzlicher Umsatzsteuer
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                  Die gewählte Zahlungsart verändert den Gesamtpreis nicht.
                </p>
                {feePercentLabel ? (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                    Unsere Verwaltungsgebühr beträgt nur {feePercentLabel}&nbsp;% — deutlich
                    günstiger als bei vielen klassischen Ticketplattformen.
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
