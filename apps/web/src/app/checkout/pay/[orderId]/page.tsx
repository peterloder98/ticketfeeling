import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { DevPayButton } from "@/components/dev-pay-button";
import { StripePayForm } from "@/components/stripe-pay-form";
import { getPaymentProvider } from "@/lib/payments";
import { paymentMethodLabel } from "@/lib/commerce/channels";
import {
  PAYMENT_METHOD_META,
  isPaymentMethodKey,
  normalizePaymentMethodKey,
} from "@/lib/commerce/payment-fees";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe-client";
import { ClearCartBadge } from "@/components/clear-cart-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zahlung" };

type Props = { params: Promise<{ orderId: string }> };

function formatAddress(location: {
  name: string;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
} | null) {
  if (!location) return null;
  const street = [location.street, location.houseNumber].filter(Boolean).join(" ");
  const city = [location.postalCode, location.city].filter(Boolean).join(" ");
  return {
    name: location.name,
    street: street || null,
    city: city || null,
  };
}

export default async function PayPage({ params }: Props) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: true,
      items: {
        include: {
          event: { include: { location: true } },
        },
      },
      customer: true,
    },
  });
  if (!order) notFound();

  const payment = order.payments[0];
  if (!payment) notFound();
  const amountLabel = formatEuroFromCents(
    order.customerTotalCents || order.grossCents,
    order.currency,
  );
  const isDev = getPaymentProvider().key === "dev";
  const methodKey = normalizePaymentMethodKey(order.paymentMethod ?? "") ?? order.paymentMethod;
  const methodLabel = paymentMethodLabel(methodKey);
  const meta =
    methodKey && isPaymentMethodKey(methodKey) ? PAYMENT_METHOD_META[methodKey] : null;

  let clientSecret: string | null = null;
  if (!isDev && isStripeConfigured() && order.stripePaymentIntentId) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
      clientSecret = intent.client_secret;
    } catch {
      clientSecret = null;
    }
  }

  const taxRateBps = order.items[0]?.taxRateBps ?? 700;
  const taxPercentLabel = (taxRateBps / 100)
    .toFixed(taxRateBps % 100 === 0 ? 0 : 2)
    .replace(".", ",");

  if (order.status === "fulfilled" || order.status === "paid" || order.paymentStatus === "paid") {
    return (
      <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
        <div className="tf-container py-14">
          <div className="mx-auto max-w-2xl rounded-[24px] border border-[var(--tf-line)] bg-white p-8 text-center shadow-[0_8px_28px_rgba(15,39,71,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
              Erledigt
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--tf-navy)]">Schon bezahlt</h1>
            <p className="mt-3 text-[var(--tf-text-secondary)]">Deine Tickets liegen bereit.</p>
            <Link
              href={`/konto/bestellung/${order.id}?paid=1`}
              className="tf-btn tf-btn-primary mt-6 inline-flex"
            >
              Tickets anzeigen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
      <ClearCartBadge />
      <div className="tf-container py-10 md:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
            Ticketfeeling
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--tf-navy)] md:text-4xl">
            Zahlung
          </h1>
          <p className="mt-2 text-base text-[var(--tf-text-secondary)]">
            Hallo {order.customer.firstName} — bitte Zahlung für Bestellung {order.orderNumber}{" "}
            bestätigen.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-[24px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.06)] md:p-7">
              <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Deine Bestellung</h2>
              <ul className="mt-5 space-y-5">
                {order.items.map((item) => {
                  const when =
                    item.eventStartsAtSnapshot ?? item.event.eventStartsAt
                      ? (item.eventStartsAtSnapshot ?? item.event.eventStartsAt)!.toLocaleString(
                          "de-DE",
                          {
                            timeZone: "Europe/Berlin",
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : null;
                  const addr =
                    formatAddress(item.event.location) ??
                    (item.locationSnapshot
                      ? { name: item.locationSnapshot, street: null, city: null }
                      : null);
                  return (
                    <li
                      key={item.id}
                      className="border-b border-[var(--tf-line)] pb-5 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[var(--tf-navy)]">
                            {item.quantity}× {item.categorySnapshot}
                          </p>
                          <p className="mt-1 text-lg font-bold tracking-tight text-[var(--tf-navy)]">
                            {item.eventNameSnapshot}
                          </p>
                          {when ? (
                            <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
                              <span className="font-medium text-[var(--tf-navy)]">Datum · </span>
                              {when}
                            </p>
                          ) : null}
                          {addr ? (
                            <div className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                              <p>
                                <span className="font-medium text-[var(--tf-navy)]">Location · </span>
                                {addr.name}
                              </p>
                              {addr.street ? <p>{addr.street}</p> : null}
                              {addr.city ? <p>{addr.city}</p> : null}
                            </div>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-base font-semibold tabular-nums text-[var(--tf-navy)]">
                          {formatEuroFromCents(item.grossCents)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 space-y-1 border-t border-[var(--tf-line)] pt-4 text-sm">
                <div className="flex justify-between gap-4 text-lg font-semibold text-[var(--tf-navy)]">
                  <span>Gesamt</span>
                  <span className="tabular-nums">{amountLabel}</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                  inkl. gesetzlicher USt von {taxPercentLabel}&nbsp;%
                  <br />
                  {order.feeGrossCents > 0
                    ? `inkl. Verwaltungsgebühr ${formatEuroFromCents(order.feeGrossCents)}`
                    : "keine Verwaltungsgebühr"}
                </p>
              </div>

              {methodLabel !== "—" ? (
                <p className="mt-4 rounded-xl bg-[rgba(15,39,71,0.04)] px-3 py-2 text-sm text-[var(--tf-navy)]">
                  Zahlungsart: <strong>{methodLabel}</strong>
                  {meta?.brands?.length ? (
                    <span className="block text-xs text-[var(--tf-text-secondary)]">
                      {meta.brands.join(" · ")}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </section>
          </div>

          <aside className="h-fit space-y-4 lg:sticky lg:top-28">
            <div className="rounded-[24px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.06)] md:p-6">
              <p className="text-sm text-[var(--tf-text-secondary)]">Zu zahlen</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--tf-navy)]">
                {amountLabel}
              </p>
              <div className="mt-5">
                {isDev ? (
                  <>
                    <p className="mb-4 rounded-xl bg-[rgba(245,158,11,0.12)] px-3 py-2 text-sm text-[#92400e]">
                      Testmodus — keine echte Stripe-Zahlung. Für Live: PAYMENT_PROVIDER=stripe
                      setzen.
                    </p>
                    <DevPayButton
                      orderId={order.id}
                      providerPaymentId={payment.providerPaymentId ?? `dev_${order.id}`}
                      amountLabel={amountLabel}
                    />
                  </>
                ) : clientSecret ? (
                  <StripePayForm
                    clientSecret={clientSecret}
                    orderId={order.id}
                    publishableKey={
                      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
                      process.env.STRIPE_PUBLISHABLE_KEY ||
                      ""
                    }
                  />
                ) : (
                  <p className="text-sm text-[var(--tf-text-secondary)]">
                    Stripe-Zahlung konnte nicht geladen werden. Bitte Support kontaktieren.
                  </p>
                )}
              </div>
            </div>
            <p className="px-1 text-center text-xs text-[var(--tf-text-secondary)] lg:text-left">
              Sichere Zahlung über Ticketfeeling
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
