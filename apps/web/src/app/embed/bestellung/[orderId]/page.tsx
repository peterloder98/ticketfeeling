import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { OrderTicketsPanel, type OrderPositionView } from "@/components/order-tickets-panel";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { canUseTicketEntry, isTicketTransferred } from "@/lib/tickets/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets" };

type Props = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ paid?: string }>;
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
  if (!isOwner && !isStaff && sp.paid !== "1") {
    redirect(`/embed/shop`);
  }

  const paid = order.status === "paid" || order.status === "fulfilled" || sp.paid === "1";
  const eventName = order.items[0]?.eventNameSnapshot ?? "dein Event";

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
          dateStyle: "medium",
          timeStyle: "short",
        })
      : firstTicket?.event.eventStartsAt
        ? firstTicket.event.eventStartsAt.toLocaleString("de-DE", {
            timeZone: "Europe/Berlin",
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
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
          {paid ? "Kauf bestätigt" : "Bestellung"}
        </p>
        <h1 className="mt-1 text-lg font-bold text-[var(--tf-navy)]">
          {paid ? "Tickets bereit" : `Bestellung ${order.orderNumber}`}
        </h1>
        <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
          {paid
            ? `${eventName} · ${formatEuroFromCents(order.customerTotalCents || order.grossCents)}`
            : "Zahlung ausstehend."}
        </p>
      </div>

      {paid ? (
        <OrderTicketsPanel positions={positions} canForward={Boolean(isOwner || isStaff)} />
      ) : (
        <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-4 text-xs text-[var(--tf-text-secondary)]">
          Noch keine Tickets — bitte Zahlung abschließen.
        </p>
      )}

      <Link href="/embed/shop" className="tf-btn tf-btn-secondary w-full !min-h-10 text-sm">
        Weitere Events
      </Link>
    </div>
  );
}
