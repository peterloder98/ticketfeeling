import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { BrandLogo } from "@/components/brand-logo";
import { OrderTicketsPanel, type OrderPositionView } from "@/components/order-tickets-panel";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { canUseTicketEntry, isTicketTransferred } from "@/lib/tickets/access";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import { formalGermanGreeting } from "@/lib/commerce/formal-address";
import { getWalletUiFlags } from "@/lib/wallet/config";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ paid?: string; processing?: string; t?: string }>;
};

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { orderId } = await params;
  const sp = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { orderBy: { id: "asc" } },
      invoices: { select: { id: true, invoiceNumber: true } },
      tickets: {
        include: {
          qrTokens: { where: { status: "active" }, take: 1 },
          holder: true,
          event: { include: { location: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      payments: true,
    },
  });
  if (!order) notFound();

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
  const hasAccessToken = verifyOrderAccessToken(order.id, sp.t);
  if (!isOwner && !isStaff && !hasAccessToken) {
    redirect("/login");
  }

  if (order.channel === "box_office" && isStaff) {
    redirect(`/kasse/beleg/${order.id}`);
  }

  const reallyPaid =
    order.status === "paid" ||
    order.status === "fulfilled" ||
    order.paymentStatus === "paid";
  // UI hint only — never grant access via ?paid=1 / ?processing=1
  const processing =
    order.paymentStatus === "processing" ||
    (Boolean(hasAccessToken) && sp.processing === "1" && !reallyPaid);
  const paid = reallyPaid && !processing;
  const eventName = order.items[0]?.eventNameSnapshot ?? "dieses Event";
  const greeting = formalGermanGreeting(order.customer);
  const emailSent = Boolean(order.ticketSentAt);
  const hasRealEmail = !order.customer.email.includes("@ticketfeeling.local");
  const taxRateBps = order.items[0]?.taxRateBps ?? 700;
  const taxPercentLabel = (taxRateBps / 100)
    .toFixed(taxRateBps % 100 === 0 ? 0 : 2)
    .replace(".", ",");

  const ticketsByItem = new Map<string, typeof order.tickets>();
  for (const ticket of order.tickets) {
    const list = ticketsByItem.get(ticket.orderItemId) ?? [];
    list.push(ticket);
    ticketsByItem.set(ticket.orderItemId, list);
  }

  const positions: OrderPositionView[] = order.items.map((item) => {
    const itemTickets = ticketsByItem.get(item.id) ?? [];
    const firstTicket = itemTickets[0];
    const whenLabel = item.eventStartsAtSnapshot
      ? item.eventStartsAtSnapshot.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          dateStyle: "full",
          timeStyle: "short",
        })
      : firstTicket?.event.eventStartsAt
        ? firstTicket.event.eventStartsAt.toLocaleString("de-DE", {
            timeZone: "Europe/Berlin",
            dateStyle: "full",
            timeStyle: "short",
          })
        : null;
    const placeLabel =
      item.locationSnapshot ??
      (firstTicket?.event.location
        ? [firstTicket.event.location.name, firstTicket.event.location.city]
            .filter(Boolean)
            .join(", ")
        : null);

    return {
      id: item.id,
      quantity: item.quantity,
      categorySnapshot: item.categorySnapshot,
      eventNameSnapshot: item.eventNameSnapshot,
      whenLabel,
      placeLabel,
      tickets: itemTickets.map((ticket) => {
        const transferred = isTicketTransferred({
          holderCustomerId: ticket.holderCustomerId,
          orderCustomerId: order.customerId,
        });
        const canEntry =
          isStaff ||
          canUseTicketEntry({
            sessionUserId: session?.user?.id,
            sessionEmail: session?.user?.email,
            holder: ticket.holder,
            isStaff,
          });
        return {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          categorySnapshot: ticket.categorySnapshot,
          seatLabel: ticket.seatLabel,
          presence: ticket.presence,
          qrToken: canEntry ? (ticket.qrTokens[0]?.token ?? null) : null,
          holderLabel: ticket.holder
            ? `${ticket.holder.firstName} ${ticket.holder.lastName}`.trim()
            : null,
          holderFirstName: ticket.holder?.firstName ?? null,
          holderLastName: ticket.holder?.lastName ?? null,
          holderEmail: ticket.holder?.email ?? null,
          transferred,
          canUseEntry: canEntry,
        };
      }),
    };
  });

  return (
    <div className="border-b border-[var(--tf-line)] bg-[rgba(248,250,252,0.85)]">
      <div className="tf-container space-y-8 py-10 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <BrandLogo href="/" variant="mark" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
              {paid ? "Kauf bestätigt" : processing ? "Zahlung wird verarbeitet" : "Bestellung"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--tf-navy)] md:text-4xl lg:text-5xl">
              {paid
                ? `${greeting},`
                : processing
                  ? "Deine Zahlung wird verarbeitet"
                  : `Bestellung ${order.orderNumber}`}
            </h1>
            <p className="mt-3 text-base text-[var(--tf-text-secondary)] md:text-lg">
              {paid
                ? `vielen Dank für Ihre Bestellung. Wir freuen uns, dass Sie bei ${eventName} dabei sind. Nachfolgend finden Sie Ihre Tickets samt QR-Codes zum Einlass${
                    emailSent
                      ? " — zusätzlich senden wir Ihnen die Tickets per E-Mail als PDF."
                      : hasRealEmail
                        ? " — die Bestätigungs-E-Mail konnte noch nicht zugestellt werden (bitte SMTP unter Einstellungen prüfen). Ihre Tickets sind hier trotzdem verfügbar."
                        : "."
                  }`
                : processing
                  ? "Vielen Dank für Ihre Bestellung. Der Betrag wird per Lastschrift eingezogen. Sobald die Zahlung bestätigt wurde, erhalten Sie Ihre Tickets per E-Mail."
                  : "Sobald die Zahlung durch ist, erscheinen hier Ihre Tickets."}
            </p>
            {paid ? (
              <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
                Bestellnummer {order.orderNumber} ·{" "}
                {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/events" className="tf-btn tf-btn-secondary !min-h-11">
              Weitere Events
            </Link>
            <Link href="/konto" className="tf-btn tf-btn-primary !min-h-11">
              Zum Konto
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-start">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Positionen & Tickets</h2>
            {paid ? (
              <OrderTicketsPanel
                positions={positions}
                canForward={Boolean(isOwner || isStaff)}
                accessToken={hasAccessToken ? sp.t! : null}
                appleWalletEnabled={getWalletUiFlags().apple}
                googleWalletEnabled={getWalletUiFlags().google}
              />
            ) : (
              <div className="rounded-[20px] border border-[var(--tf-line)] bg-white p-5">
                <ul className="space-y-3 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium text-[var(--tf-navy)]">
                        {item.quantity}× {item.categorySnapshot}
                      </p>
                      <p className="text-[var(--tf-text-secondary)]">{item.eventNameSnapshot}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-[var(--tf-text-secondary)]">
                  {processing
                    ? "Noch keine Tickets — die Lastschrift wird verarbeitet."
                    : "Noch keine Tickets — Zahlung ausstehend."}
                </p>
              </div>
            )}
          </div>

          <aside className="rounded-[20px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.05)] md:p-6 lg:sticky lg:top-6">
            <h2 className="text-base font-semibold text-[var(--tf-navy)]">Zusammenfassung</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="text-[var(--tf-text-secondary)]">
                    {item.quantity}× {item.categorySnapshot}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--tf-navy)]">
                    {formatEuroFromCents(item.grossCents)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t border-[var(--tf-line)] pt-3 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-[var(--tf-navy)]">Gesamt</span>
                <span className="font-semibold tabular-nums text-[var(--tf-navy)]">
                  {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)]">
                inkl. gesetzlicher USt von {taxPercentLabel}&nbsp;%
                <br />
                {order.feeGrossCents > 0
                  ? `inkl. Verwaltungsgebühr ${formatEuroFromCents(order.feeGrossCents)}`
                  : "keine Verwaltungsgebühr"}
              </p>
            </div>
            {order.invoices[0] && (order.invoiceRequested || isStaff) ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[var(--tf-text-secondary)]">
                  Rechnung {order.invoices[0].invoiceNumber}
                  {order.invoiceRequested ? " · angefordert" : ""}
                </p>
                {(isOwner || isStaff || hasAccessToken) && paid ? (
                  <a
                    href={
                      hasAccessToken && sp.t
                        ? `/api/v1/invoices/${order.invoices[0].id}/pdf?t=${encodeURIComponent(sp.t)}`
                        : `/api/v1/invoices/${order.invoices[0].id}/pdf`
                    }
                    className="tf-btn tf-btn-secondary inline-flex !py-2 text-xs"
                  >
                    Rechnung als PDF herunterladen
                  </a>
                ) : null}
              </div>
            ) : null}
            {paid && (isOwner || isStaff) ? (
              <p className="mt-4 rounded-xl bg-[rgba(20,184,166,0.08)] px-3 py-2 text-xs leading-relaxed text-[var(--tf-navy)]">
                Tipp: Einzelne Tickets kannst du an Begleitung weiterleiten. Nach der ersten
                Weiterleitung kannst du nur noch erneut an dieselbe Person senden.
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
