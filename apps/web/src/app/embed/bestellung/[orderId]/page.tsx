import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { OrderTicketsPanel, type OrderPositionView } from "@/components/order-tickets-panel";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { canUseTicketEntryWithGuestToken, isTicketTransferred } from "@/lib/tickets/access";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import { formalGermanGreeting } from "@/lib/commerce/formal-address";
import { getWalletUiFlags } from "@/lib/wallet/config";
import { mergeOrderTicketPositions } from "@/lib/commerce/merge-category-lines";
import { BERLIN_TZ, formatDeDateTime } from "@/lib/datetime-de";
import { PurchaseTrackingBeacon } from "@/components/purchase-tracking-beacon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets" };

type Props = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ paid?: string; processing?: string; t?: string }>;
};

export default async function EmbedOrderTicketsPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const { orderId } = await params;
  const sp = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { orderBy: { id: "asc" } },
      tickets: {
        include: {
          qrTokens: { where: { status: "active" }, take: 1 },
          holder: true,
          event: { include: { location: true } },
        },
        orderBy: { createdAt: "asc" },
      },
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
    redirect(`/embed/shop`);
  }

  const reallyPaid =
    order.status === "paid" ||
    order.status === "fulfilled" ||
    order.paymentStatus === "paid";
  const processing =
    order.paymentStatus === "processing" ||
    (Boolean(hasAccessToken) && sp.processing === "1" && !reallyPaid);
  const paid = reallyPaid && !processing;
  const eventName = order.items[0]?.eventNameSnapshot ?? "dieses Event";
  const greeting = formalGermanGreeting(order.customer);
  const emailSent = Boolean(order.ticketSentAt);
  const hasRealEmail = !order.customer.email.includes("@ticketfeeling.local");

  const ticketsByItem = new Map<string, typeof order.tickets>();
  for (const ticket of order.tickets) {
    const list = ticketsByItem.get(ticket.orderItemId) ?? [];
    list.push(ticket);
    ticketsByItem.set(ticket.orderItemId, list);
  }

  const positions: OrderPositionView[] = mergeOrderTicketPositions(
    order.items.map((item) => {
      const itemTickets = ticketsByItem.get(item.id) ?? [];
      const firstTicket = itemTickets[0];
      const whenLabel = item.eventStartsAtSnapshot
        ? formatDeDateTime(item.eventStartsAtSnapshot, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : firstTicket?.event.eventStartsAt
          ? formatDeDateTime(firstTicket.event.eventStartsAt, {
              dateStyle: "medium",
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
      const doorsOpenAt = firstTicket?.event.doorsOpenAt ?? null;
      const doorsOpenLabel = doorsOpenAt
        ? doorsOpenAt.toLocaleTimeString("de-DE", {
            timeZone: BERLIN_TZ,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            hourCycle: "h23",
          })
        : null;
      const startsAt =
        item.eventStartsAtSnapshot ?? firstTicket?.event.eventStartsAt ?? null;
      const endsAt = firstTicket?.event.eventEndsAt ?? null;

      return {
        id: item.id,
        quantity: item.quantity,
        categorySnapshot: item.categorySnapshot,
        eventNameSnapshot: item.eventNameSnapshot,
        unitPriceCents: item.unitPaidGrossCents || item.unitListGrossCents,
        eventKey: item.eventId,
        whenLabel,
        placeLabel,
        doorsOpenLabel,
        startsAtIso: startsAt ? startsAt.toISOString() : null,
        endsAtIso: endsAt ? endsAt.toISOString() : null,
        tickets: itemTickets.map((ticket) => {
          const transferred = isTicketTransferred({
            holderCustomerId: ticket.holderCustomerId,
            orderCustomerId: order.customerId,
          });
          const canEntry = canUseTicketEntryWithGuestToken({
            sessionUserId: session?.user?.id,
            sessionEmail: session?.user?.email,
            holder: ticket.holder,
            isStaff,
            hasAccessToken,
            transferred,
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
    }),
  );

  return (
    <div className="space-y-4 text-sm">
      {paid ? (
        <PurchaseTrackingBeacon
          orderId={order.id}
          accessToken={sp.t ?? null}
          embedMode
        />
      ) : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          {paid ? "Kauf bestätigt" : processing ? "Zahlung wird verarbeitet" : "Bestellung"}
        </p>
        <h1 className="mt-1 text-lg font-bold text-[var(--tf-navy)]">
          {paid
            ? `${greeting},`
            : processing
              ? "Deine Zahlung wird verarbeitet"
              : `Bestellung ${order.orderNumber}`}
        </h1>
        {paid ? (
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-[var(--tf-text-secondary)]">
            <p>
              vielen Dank für Ihre Bestellung. Wir freuen uns, dass Sie bei{" "}
              <strong className="text-[var(--tf-navy)]">{eventName}</strong> dabei sind.
            </p>
            <p>
              Nachfolgend finden Sie Ihre Tickets samt QR-Codes zum Einlass
              {emailSent
                ? " — die Bestätigungs-E-Mail mit Links zu PDF, Wallet und Kalender ist unterwegs."
                : hasRealEmail
                  ? " — die Bestätigungs-E-Mail konnte noch nicht zugestellt werden (SMTP in den Einstellungen prüfen). Ihre Tickets sind hier trotzdem verfügbar."
                  : "."}
            </p>
            <p className="text-[11px] text-[var(--tf-text-secondary)]">
              Bestellung {order.orderNumber} ·{" "}
              {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
            {processing
              ? "Lastschrift eingereicht — Ticket kommt nach Zahlungsbestätigung per E-Mail."
              : "Zahlung ausstehend."}
          </p>
        )}
      </div>

      {paid ? (
        <OrderTicketsPanel
          positions={positions}
          canForward={Boolean(isOwner || isStaff)}
          ticketPathPrefix="/embed/ticket"
          accessToken={hasAccessToken ? sp.t! : null}
          appleWalletEnabled={getWalletUiFlags().apple}
          googleWalletEnabled={getWalletUiFlags().google}
        />
      ) : (
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-4 text-xs text-[var(--tf-text-secondary)]">
          {processing
            ? "Noch keine Tickets — die Lastschrift wird verarbeitet."
            : "Noch keine Tickets — bitte Zahlung abschließen."}
        </p>
      )}

      <Link href="/embed/shop" className="tf-btn tf-btn-secondary w-full !min-h-10 text-sm">
        Weitere Events
      </Link>
    </div>
  );
}
