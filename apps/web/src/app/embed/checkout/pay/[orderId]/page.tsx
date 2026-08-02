import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { DevPayButton } from "@/components/dev-pay-button";
import { StripePayForm } from "@/components/stripe-pay-form";
import { getPaymentProvider } from "@/lib/payments";
import { paymentMethodLabel } from "@/lib/commerce/channels";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe-client";
import { ClearCartBadge } from "@/components/clear-cart-badge";
import { formalGermanGreeting } from "@/lib/commerce/formal-address";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zahlung" };

type Props = { params: Promise<{ orderId: string }> };

export default async function EmbedPayPage({ params }: Props) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: true,
      items: true,
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
  const successPath = `/embed/bestellung/${order.id}?paid=1`;

  let clientSecret: string | null = null;
  if (!isDev && isStripeConfigured() && order.stripePaymentIntentId) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
      clientSecret = intent.client_secret;
    } catch {
      clientSecret = null;
    }
  }

  if (order.status === "fulfilled" || order.status === "paid" || order.paymentStatus === "paid") {
    return (
      <div className="space-y-3 py-4 text-center text-sm">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Schon bezahlt</h1>
        <Link href={successPath} className="tf-btn tf-btn-primary inline-flex !min-h-10 text-sm">
          Tickets anzeigen
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <ClearCartBadge />
      <div>
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Zahlung</h1>
        <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
          {formalGermanGreeting(order.customer)} — Bestellung {order.orderNumber}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5">
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2 text-xs">
              <span>
                {item.quantity}× {item.categorySnapshot}
                <span className="block text-[var(--tf-text-secondary)]">
                  {item.eventNameSnapshot}
                </span>
              </span>
              <span className="tabular-nums font-medium">{formatEuroFromCents(item.grossCents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-[var(--tf-line)] pt-2 font-semibold text-[var(--tf-navy)]">
          <span>Gesamt</span>
          <span className="tabular-nums">{amountLabel}</span>
        </p>
        <p className="mt-1 text-[11px] text-[var(--tf-text-secondary)]">
          Zahlungsart: {paymentMethodLabel(order.paymentMethod)}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--tf-line)] p-3">
        {isDev ? (
          <DevPayButton
            orderId={order.id}
            providerPaymentId={payment.providerPaymentId ?? `dev_${order.id}`}
            amountLabel={amountLabel}
            successPath={successPath}
          />
        ) : clientSecret ? (
          <StripePayForm
            clientSecret={clientSecret}
            orderId={order.id}
            publishableKey={
              process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
              process.env.STRIPE_PUBLISHABLE_KEY ||
              ""
            }
            successPath={successPath}
          />
        ) : (
          <p className="text-xs text-[var(--tf-text-secondary)]">
            Zahlung konnte nicht geladen werden. Bitte Support kontaktieren.
          </p>
        )}
      </div>
    </div>
  );
}
