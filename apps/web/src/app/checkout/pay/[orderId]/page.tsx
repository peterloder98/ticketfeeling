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
import {
  verifyOrderAccessToken,
  withOrderAccessQuery,
} from "@/lib/commerce/order-access";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zahlung" };

type Props = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default async function PayPage({ params, searchParams }: Props) {
  const { orderId } = await params;
  const sp = await searchParams;
  const session = await getServerSession(authOptions);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: true,
      customer: true,
    },
  });
  if (!order) notFound();

  const hasAccessToken = verifyOrderAccessToken(order.id, sp.t);
  let isStaff = false;
  if (session?.user) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership?.organizationId === order.organizationId) {
      isStaff =
        (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "events:read"));
    }
  }
  const isOwner =
    Boolean(session?.user) &&
    (order.customer.userId === session!.user!.id ||
      order.customer.emailNormalized === session!.user!.email?.toLowerCase());
  if (!hasAccessToken && !isOwner && !isStaff) {
    redirect("/login");
  }

  const accessToken = hasAccessToken ? sp.t! : null;
  const ticketsHref = withOrderAccessQuery(
    `/konto/bestellung/${order.id}`,
    accessToken,
  );
  const paidHref = withOrderAccessQuery(
    `/konto/bestellung/${order.id}?paid=1`,
    accessToken,
  );
  const processingHref = withOrderAccessQuery(
    `/konto/bestellung/${order.id}?processing=1`,
    accessToken,
  );

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
  const isSepa = methodKey === "sepa_debit" || methodKey === "stripe_sepa";
  const isKlarna = methodKey === "klarna";

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
      <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
        <div className="tf-container py-14">
          <div className="mx-auto max-w-lg rounded-[24px] border border-[var(--tf-line)] bg-white p-8 text-center shadow-[0_8px_28px_rgba(15,39,71,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
              Erledigt
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--tf-navy)]">Schon bezahlt</h1>
            <p className="mt-3 text-[var(--tf-text-secondary)]">Ihre Tickets liegen bereit.</p>
            <Link href={paidHref || ticketsHref} className="tf-btn tf-btn-primary mt-6 inline-flex">
              Tickets anzeigen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (order.paymentStatus === "processing") {
    return (
      <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
        <div className="tf-container py-14">
          <div className="mx-auto max-w-lg rounded-[24px] border border-[var(--tf-line)] bg-white p-8 text-center shadow-[0_8px_28px_rgba(15,39,71,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
              Lastschrift
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--tf-navy)]">
              Deine Zahlung wird verarbeitet
            </h1>
            <p className="mt-3 text-[var(--tf-text-secondary)]">
              Vielen Dank für deine Bestellung. Der Betrag wird per Lastschrift eingezogen. Sobald
              die Zahlung bestätigt wurde, erhältst du deine endgültige Zahlungsbestätigung und dein
              Ticket per E-Mail.
            </p>
            <Link href={processingHref} className="tf-btn tf-btn-primary mt-6 inline-flex">
              Bestellung ansehen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const headline = isSepa
    ? "IBAN eingeben"
    : isKlarna
      ? "Mit Klarna weiter"
      : "Zahlungsdaten eingeben";
  const helper = isSepa
    ? "Nur noch die Bankverbindung — danach erteilst du das Lastschriftmandat."
    : isKlarna
      ? "Als Nächstes öffnet sich Klarna. Betrag und Bestellung sind schon erfasst."
      : "Nur noch Karte oder Wallet — Betrag und Bestellung sind schon erfasst.";

  return (
    <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
      <ClearCartBadge />
      <div className="tf-container py-10 md:py-14">
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-6 text-center md:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
              Fast geschafft
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--tf-navy)] md:text-[2.1rem]">
              {headline}
            </h1>
            <p className="mt-2 text-base text-[var(--tf-text-secondary)]">{helper}</p>
          </div>

          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[18px] border border-[var(--tf-line)] bg-white px-4 py-3 shadow-[0_4px_16px_rgba(15,39,71,0.04)]">
            <div className="min-w-0">
              <p className="text-sm text-[var(--tf-text-secondary)]">
                Bestellung {order.orderNumber}
                {methodLabel !== "—" ? (
                  <>
                    {" · "}
                    <span className="text-[var(--tf-navy)]">{methodLabel}</span>
                  </>
                ) : null}
              </p>
              {meta?.brands?.length ? (
                <p className="mt-0.5 text-xs text-[var(--tf-text-secondary)]">
                  {meta.brands.join(" · ")}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-2xl font-bold tabular-nums text-[var(--tf-navy)]">
              {amountLabel}
            </p>
          </div>

          <div className="rounded-[24px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.06)] md:p-6">
            {isDev ? (
              <>
                <p className="mb-4 rounded-xl bg-[rgba(245,158,11,0.12)] px-3 py-2 text-sm text-[#92400e]">
                  Testmodus — keine echte Stripe-Zahlung. Für Live: PAYMENT_PROVIDER=stripe setzen.
                </p>
                <DevPayButton
                  orderId={order.id}
                  amountLabel={amountLabel}
                  successPath={paidHref}
                  accessToken={accessToken ?? undefined}
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
                amountLabel={amountLabel}
                paymentMethod={order.paymentMethod}
                successPath={paidHref}
                processingPath={processingHref}
                autoFocus
              />
            ) : (
              <p className="text-sm text-[var(--tf-text-secondary)]">
                Stripe-Zahlung konnte nicht geladen werden. Bitte Support kontaktieren.
              </p>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-[var(--tf-text-secondary)]">
            Sichere Zahlung über Ticketfeeling
          </p>
        </div>
      </div>
    </div>
  );
}
