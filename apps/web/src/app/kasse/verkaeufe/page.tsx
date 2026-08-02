import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import {
  boxOfficeSaleStatusLabel,
  channelShortHint,
  orderCancelledStrikeClass,
  paymentMethodLabel,
} from "@/lib/commerce/channels";
import { canSellAllBoxOfficeEvents } from "@/lib/commerce/box-office-access";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  BoxOfficeSaleRowActions,
  BoxOfficeVoidButton,
} from "@/components/box-office-sale-row-actions";
import { SmartDateInput } from "@/components/admin/smart-date-input";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tageskasse · Verkäufe" };

type Props = { searchParams: Promise<{ day?: string; eventId?: string }> };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

export default async function BoxOfficeSalesPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");

  const canView =
    (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "reports:read"));
  if (!canView) {
    return <p className="tf-container py-8 text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  const fullAccess = await canSellAllBoxOfficeEvents(
    session.user.id,
    membership.organizationId,
  );

  const sp = await searchParams;
  const dayKey = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const day = dayKey ? new Date(`${dayKey}T12:00:00`) : new Date();
  const from = startOfDay(day);
  const to = endOfDay(day);
  const eventId = sp.eventId && sp.eventId.length > 0 ? sp.eventId : null;

  const events = await prisma.event.findMany({
    where: { organizationId: membership.organizationId },
    select: { id: true, name: true },
    orderBy: { eventStartsAt: "desc" },
    take: 80,
  });

  const orders = await prisma.order.findMany({
    where: {
      organizationId: membership.organizationId,
      channel: "box_office",
      createdAt: { gte: from, lt: to },
      ...(eventId ? { items: { some: { eventId } } } : {}),
      ...(fullAccess ? {} : { soldByUserId: session.user.id }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      items: true,
      tickets: { select: { id: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const activeOrders = orders.filter((o) => !o.voidedAt);
  const ticketCount = activeOrders.reduce((s, o) => s + o.tickets.length, 0);
  const grossCents = activeOrders.reduce((s, o) => s + o.grossCents, 0);
  const dayParam = dayKey ?? from.toISOString().slice(0, 10);

  const selectedEventName = eventId
    ? (events.find((e) => e.id === eventId)?.name ?? null)
    : null;
  const grossWithFee = activeOrders.reduce(
    (s, o) => s + (o.customerTotalCents || o.grossCents),
    0,
  );

  return (
    <div className="w-full space-y-6 px-4 py-8 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
            Tageskasse
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-4xl">
            {selectedEventName
              ? `Verkäufe · ${selectedEventName}`
              : fullAccess
                ? "Verkaufsübersicht"
                : "Meine Verkäufe"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
            {fullAccess
              ? `Alle Tageskasse-Verkäufe · filtern · drucken · stornieren. ${channelShortHint("box_office")}.`
              : "Nur deine eigenen Verkäufe. Storno nur, solange Tickets noch nicht ausgegeben wurden."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/kasse" className="tf-btn tf-btn-primary !py-2 text-sm">
            Neuer Verkauf
          </Link>
          {fullAccess ? (
            <Link href="/admin/partner" className="tf-btn tf-btn-secondary !py-2 text-sm">
              Partner einladen
            </Link>
          ) : null}
        </div>
      </div>
      {fullAccess ? <AdminSubnav items={ADMIN_SUBNAV.verkauf} /> : null}

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm"
        method="get"
      >
        <div className="min-w-[11rem]">
          <SmartDateInput name="day" label="Tag" defaultValue={dayParam} />
        </div>
        <label className="grid min-w-[12rem] flex-1 gap-1">
          <span className="text-[var(--tf-text-secondary)]">Event</span>
          <select name="eventId" defaultValue={eventId ?? ""} className="tf-input">
            <option value="">Alle Events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="tf-btn tf-btn-secondary !py-2 text-sm">
          Anzeigen
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Verkäufe (aktiv)</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{activeOrders.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Tickets</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{ticketCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Umsatz inkl. Gebühr</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">
            {formatEuroFromCents(grossWithFee || grossCents)}
          </p>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-[var(--tf-line)] bg-white">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-[var(--tf-line)] bg-[#f8fafc] text-[var(--tf-text-secondary)]">
            <tr>
              <th className="px-3 py-3 font-medium">Zeit</th>
              <th className="px-3 py-3 font-medium">Beleg</th>
              <th className="px-3 py-3 font-medium">Event</th>
              <th className="px-3 py-3 font-medium">Positionen</th>
              <th className="px-3 py-3 font-medium">Kunde</th>
              <th className="px-3 py-3 font-medium">Zahlung</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium text-right">Betrag</th>
              <th className="px-3 py-3 font-medium text-right">Aktionen</th>
              <th className="px-3 py-3 text-center font-medium">Storno</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const payment = order.payments[0];
              const voided = Boolean(order.voidedAt);
              const cancelled =
                voided || order.status === "cancelled" || order.status === "refunded";
              const strike = orderCancelledStrikeClass(cancelled);
              const lines = order.items
                .map((i) => `${i.quantity}× ${i.categorySnapshot}`)
                .join(", ");
              const customerName = `${order.customer.firstName} ${order.customer.lastName}`.trim();
              const customerEmail = order.customer.email.includes("@ticketfeeling.local")
                ? null
                : order.customer.email;

              return (
                <tr
                  key={order.id}
                  className={`border-b border-[var(--tf-line)]/80 ${cancelled ? "bg-red-50/40" : ""}`}
                >
                  <td className="px-3 py-3 whitespace-nowrap text-[var(--tf-text-secondary)]">
                    <p>
                      {order.createdAt.toLocaleTimeString("de-DE", {
                        timeZone: "Europe/Berlin",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-[11px]">
                      {order.createdAt.toLocaleDateString("de-DE", {
                        timeZone: "Europe/Berlin",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </td>
                  <td className={`px-3 py-3 ${strike}`}>
                    <Link
                      href={`/kasse/beleg/${order.id}`}
                      className="font-semibold text-[var(--tf-navy)] underline-offset-2 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-[var(--tf-text-secondary)]">
                      {order.tickets.length} Ticket{order.tickets.length === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className={`px-3 py-3 ${strike}`}>
                    <p className="font-medium text-[var(--tf-navy)]">
                      {order.items[0]?.eventNameSnapshot ?? "—"}
                    </p>
                    {order.items[0]?.eventStartsAtSnapshot ? (
                      <p className="text-[11px] text-[var(--tf-text-secondary)]">
                        {new Date(order.items[0].eventStartsAtSnapshot).toLocaleString("de-DE", {
                          timeZone: "Europe/Berlin",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    ) : null}
                  </td>
                  <td className={`px-3 py-3 text-xs text-[var(--tf-text-secondary)] ${strike}`}>
                    {lines || "—"}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <p className="font-medium text-[var(--tf-navy)]">{customerName || "—"}</p>
                    {customerEmail ? (
                      <p className="text-[var(--tf-text-secondary)]">{customerEmail}</p>
                    ) : (
                      <p className="text-[var(--tf-text-secondary)]">Walk-in</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <p>{paymentMethodLabel(payment?.method)}</p>
                    {payment?.status ? (
                      <p className="text-[var(--tf-text-secondary)]">{payment.status}</p>
                    ) : null}
                  </td>
                  <td
                    className={`px-3 py-3 ${
                      cancelled
                        ? "font-semibold text-[var(--danger)]"
                        : "text-[var(--tf-text-secondary)]"
                    }`}
                  >
                    {boxOfficeSaleStatusLabel({
                      voided,
                      deliveryStatus: order.deliveryStatus,
                      orderStatus: order.status,
                    })}
                  </td>
                  <td className={`px-3 py-3 text-right font-medium tabular-nums ${strike}`}>
                    {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <BoxOfficeSaleRowActions
                      orderId={order.id}
                      ticketIds={order.tickets.map((t) => t.id)}
                      voided={voided}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <BoxOfficeVoidButton
                      orderId={order.id}
                      voided={voided}
                      deliveryStatus={order.deliveryStatus}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 ? (
          <p className="px-3 py-8 text-center text-[var(--tf-text-secondary)]">
            Keine Tageskasse-Verkäufe an diesem Tag
            {eventId ? " für dieses Event" : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
