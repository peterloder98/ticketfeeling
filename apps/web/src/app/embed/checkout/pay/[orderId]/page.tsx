import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { DevPayButton } from "@/components/dev-pay-button";
import { StripePayForm } from "@/components/stripe-pay-form";
import { getPaymentProvider } from "@/lib/payments";
import { paymentMethodLabel } from "@/lib/commerce/channels";
import { normalizePaymentMethodKey } from "@/lib/commerce/payment-fees";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe-client";
import { ClearCartBadge } from "@/components/clear-cart-badge";
import {
  verifyOrderAccessToken,
  withOrderAccessQuery,
} from "@/lib/commerce/order-access";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zahlung" };

type Props = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default async function EmbedPayPage({ params, searchParams }: Props) {
  const [{ orderId }, sp] = await Promise.all([params, searchParams]);
  const [session, order] = await Promise.all([
    getSession(),
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        customer: {
          select: {
            userId: true,
            emailNormalized: true,
          },
        },
      },
    }),
  ]);
  if (!order) notFound();

  const hasAccessToken = verifyOrderAccessToken(order.id, sp.t);
  let isStaff = false;
  if (session?.user) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership?.organizationId === order.organizationId) {
      const keys = await getUserPermissionKeys(session.user.id, membership.organizationId);
      isStaff = keys.has("org:read") || keys.has("events:read");
    }
  }
  const isOwner =
    Boolean(session?.user) &&
    (order.customer.userId === session!.user!.id ||
      order.customer.emailNormalized === session!.user!.email?.toLowerCase());
  if (!hasAccessToken && !isOwner && !isStaff) {
    redirect("/embed/shop");
  }
  const accessToken = hasAccessToken ? sp.t! : null;

  const payment = order.payments[0];
  if (!payment) notFound();
  const amountLabel = formatEuroFromCents(
    order.customerTotalCents || order.grossCents,
    order.currency,
  );
  const isDev = getPaymentProvider().key === "dev";
  const methodKey = normalizePaymentMethodKey(order.paymentMethod ?? "") ?? order.paymentMethod;
  const methodLabel = paymentMethodLabel(methodKey);
  const isSepa = methodKey === "sepa_debit" || methodKey === "stripe_sepa";
  const isKlarna = methodKey === "klarna";
  const successPath = withOrderAccessQuery(`/embed/bestellung/${order.id}?paid=1`, accessToken);
  const processingPath = withOrderAccessQuery(
    `/embed/bestellung/${order.id}?processing=1`,
    accessToken,
  );

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

  if (order.paymentStatus === "processing") {
    return (
      <div className="space-y-3 py-4 text-center text-sm">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Zahlung wird verarbeitet</h1>
        <p className="text-xs text-[var(--tf-text-secondary)]">
          Der Betrag wird per Lastschrift eingezogen. Dein Ticket kommt nach Bestätigung per E-Mail.
        </p>
        <Link
          href={processingPath}
          className="tf-btn tf-btn-primary inline-flex !min-h-10 text-sm"
        >
          Bestellung ansehen
        </Link>
      </div>
    );
  }

  const headline = isSepa
    ? "IBAN eingeben"
    : isKlarna
      ? "Mit Klarna weiter"
      : "Zahlungsdaten eingeben";

  return (
    <div className="space-y-4 text-sm">
      <ClearCartBadge />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          Fast geschafft
        </p>
        <h1 className="mt-1 text-lg font-bold text-[var(--tf-navy)]">{headline}</h1>
        <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
          Bestellung {order.orderNumber}
          {methodLabel !== "—" ? ` · ${methodLabel}` : null}
          {" · "}
          <span className="font-semibold tabular-nums text-[var(--tf-navy)]">{amountLabel}</span>
        </p>
      </div>

      <div className="rounded-xl border border-[var(--tf-line)] p-3">
        {isDev ? (
          <DevPayButton
            orderId={order.id}
            amountLabel={amountLabel}
            successPath={successPath}
            accessToken={accessToken ?? undefined}
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
            amountLabel={amountLabel}
            successPath={successPath}
            processingPath={processingPath}
            paymentMethod={order.paymentMethod}
            autoFocus
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
