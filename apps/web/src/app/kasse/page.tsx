import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { BoxOfficeForm } from "@/components/box-office-form";
import { BoxOfficeSessionPanel } from "@/components/box-office-session-panel";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import {
  canSellAllBoxOfficeEvents,
  getBoxOfficeSellableEventIds,
} from "@/lib/commerce/box-office-access";
import {
  boxOfficeSaleStatusLabel,
  channelShortHint,
  orderCancelledStrikeClass,
  paymentMethodLabel,
} from "@/lib/commerce/channels";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import {
  BoxOfficeSaleRowActions,
  BoxOfficeVoidButton,
} from "@/components/box-office-sale-row-actions";
import { SmartDateInput } from "@/components/admin/smart-date-input";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tageskasse" };

const SALES_LIMIT = 500;

type Props = {
  searchParams: Promise<{ from?: string; to?: string; eventId?: string; day?: string }>;
};

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

function parseDayKey(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function BoxOfficePage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");

  const canSell =
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  const canView =
    canSell ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "reports:read"));

  if (!canView) {
    return (
      <p className="tf-container py-8 text-[var(--danger)]">
        Keine Berechtigung für die Tageskasse.
      </p>
    );
  }

  const sellableIds = canSell
    ? await getBoxOfficeSellableEventIds(session.user.id, membership.organizationId)
    : null;
  const isPartner = canSell && sellableIds !== null;
  const fullAccess = await canSellAllBoxOfficeEvents(
    session.user.id,
    membership.organizationId,
  );

  const sp = await searchParams;
  // Legacy ?day= from /kasse/verkaeufe → treat as from=to
  const legacyDay = parseDayKey(sp.day);
  const fromKey = parseDayKey(sp.from) ?? legacyDay;
  const toKey = parseDayKey(sp.to) ?? legacyDay;
  const eventId = sp.eventId && sp.eventId.length > 0 ? sp.eventId : null;

  const createdAtFilter: { gte?: Date; lt?: Date } = {};
  if (fromKey) createdAtFilter.gte = startOfDay(new Date(`${fromKey}T12:00:00`));
  if (toKey) createdAtFilter.lt = endOfDay(new Date(`${toKey}T12:00:00`));

  const today = startOfDay(new Date());
  const partnerSaleFilter = fullAccess ? {} : { soldByUserId: session.user.id };

  const [orgSettings, events, todaySales, filterEvents, orders] = await Promise.all([
    canSell
      ? prisma.organizationSettings.findUnique({
          where: { organizationId: membership.organizationId },
          select: { platformFeeConfig: true },
        })
      : Promise.resolve(null),
    canSell
      ? prisma.event.findMany({
          where: {
            organizationId: membership.organizationId,
            status: { in: ["presale_active", "published"] },
            ...(sellableIds ? { id: { in: sellableIds } } : {}),
          },
          include: {
            location: { select: { name: true, city: true } },
            ticketCategories: {
              where: { status: "active", boxOfficeBookable: true },
              include: { pools: true },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { eventStartsAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.order.findMany({
      where: {
        organizationId: membership.organizationId,
        channel: "box_office",
        createdAt: { gte: today },
        voidedAt: null,
        ...partnerSaleFilter,
      },
      select: {
        id: true,
        customerTotalCents: true,
        grossCents: true,
        tickets: { select: { id: true } },
      },
    }),
    prisma.event.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true, name: true },
      orderBy: { eventStartsAt: "desc" },
      take: 80,
    }),
    prisma.order.findMany({
      where: {
        organizationId: membership.organizationId,
        channel: "box_office",
        ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
        ...(eventId ? { items: { some: { eventId } } } : {}),
        ...partnerSaleFilter,
      },
      orderBy: { createdAt: "desc" },
      take: SALES_LIMIT + 1,
      include: {
        customer: true,
        items: true,
        tickets: { select: { id: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  const hasMoreSales = orders.length > SALES_LIMIT;
  const salesList = hasMoreSales ? orders.slice(0, SALES_LIMIT) : orders;
  const activeOrders = salesList.filter((o) => !o.voidedAt);
  const ticketCount = activeOrders.reduce((s, o) => s + o.tickets.length, 0);
  const grossWithFee = activeOrders.reduce(
    (s, o) => s + (o.customerTotalCents || o.grossCents),
    0,
  );

  const todayGross = todaySales.reduce(
    (s, o) => s + (o.customerTotalCents || o.grossCents),
    0,
  );
  const todayTickets = todaySales.reduce((s, o) => s + o.tickets.length, 0);

  const feeConfig = resolveActivePlatformFeeConfig(orgSettings?.platformFeeConfig);
  const now = Date.now();

  const payload = events.map((event) => ({
    id: event.id,
    name: event.name,
    whenLabel: event.eventStartsAt
      ? event.eventStartsAt.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    locationLabel: event.location
      ? `${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
      : null,
    categories: event.ticketCategories.map((category) => {
      const pool =
        category.pools.find((p) => p.channel === "box_office") ??
        category.pools.find((p) => p.channel === "online");
      const available = pool
        ? Math.max(0, pool.capacity - pool.soldQuantity - pool.heldQuantity)
        : Math.max(0, category.capacity - category.safetyReserve);
      let saleLabel: string | null = null;
      if (category.saleEndsAt && category.saleEndsAt.getTime() > now) {
        saleLabel = "Zeitlich begrenzt";
      } else if (category.saleStartsAt && category.saleStartsAt.getTime() > now) {
        saleLabel = "Verkauf startet später";
      }
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        priceGrossCents: category.priceGrossCents,
        available,
        saleLabel,
      };
    }),
  }));

  const selectedEventName = eventId
    ? (filterEvents.find((e) => e.id === eventId)?.name ?? null)
    : null;
  const rangeHint =
    fromKey || toKey
      ? ` · ${fromKey ?? "…"} bis ${toKey ?? "…"}`
      : " · alle Tage";

  return (
    <div className="tf-container space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel="box_office" />
            <span className="text-xs text-[var(--tf-text-secondary)]">Verkauf vor Ort</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-4xl">
            Tageskasse
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
            {isPartner
              ? "Dein Vorverkaufszugang — verkaufen und eigene Verkäufe einsehen."
              : canSell
                ? `Verkaufen, alle Tageskasse-Verkäufe einsehen, drucken und stornieren. ${channelShortHint("box_office")}.`
                : "Übersicht aller Tageskasse-Verkäufe."}
          </p>
        </div>
        {fullAccess ? (
          <Link href="/admin/partner" className="tf-btn tf-btn-secondary !py-2 text-sm">
            Partner einladen
          </Link>
        ) : null}
      </div>
      {!isPartner ? <AdminSubnav items={ADMIN_SUBNAV.verkauf} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">
            {isPartner ? "Meine Verkäufe heute" : "Verkäufe heute"}
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{todaySales.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Tickets heute</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{todayTickets}</p>
        </div>
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Umsatz heute</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">
            {formatEuroFromCents(todayGross)}
          </p>
        </div>
      </div>

      {canSell ? (
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.05)] md:p-6">
          <BoxOfficeForm
            events={payload}
            feeConfig={{
              enabled: feeConfig.enabled,
              percentageBasisPoints: feeConfig.percentageBasisPoints,
              displayName: feeConfig.displayName,
            }}
          />
        </div>
      ) : null}

      <section id="verkaeufe" className="w-full space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">
            {selectedEventName
              ? `Verkäufe · ${selectedEventName}`
              : fullAccess
                ? "Alle Verkäufe"
                : "Meine Verkäufe"}
          </h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Vollständige Übersicht{rangeHint}. Optional nach Zeitraum und Event filtern.
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm"
          method="get"
        >
          <div className="min-w-[11rem]">
            <SmartDateInput name="from" label="Von" defaultValue={fromKey ?? ""} />
          </div>
          <div className="min-w-[11rem]">
            <SmartDateInput name="to" label="Bis" defaultValue={toKey ?? ""} />
          </div>
          <label className="grid min-w-[12rem] flex-1 gap-1">
            <span className="text-sm font-medium text-[var(--tf-navy)]">Event</span>
            <select name="eventId" defaultValue={eventId ?? ""} className="tf-input">
              <option value="">Alle Events</option>
              {filterEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="tf-btn tf-btn-secondary !py-2 text-sm">
            Filtern
          </button>
          {fromKey || toKey || eventId ? (
            <Link href="/kasse#verkaeufe" className="tf-btn tf-btn-secondary !py-2 text-sm">
              Filter zurücksetzen
            </Link>
          ) : null}
        </form>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
            <p className="text-sm text-[var(--tf-text-secondary)]">Verkäufe (aktiv)</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">
              {activeOrders.length}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
            <p className="text-sm text-[var(--tf-text-secondary)]">Tickets</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{ticketCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
            <p className="text-sm text-[var(--tf-text-secondary)]">Umsatz inkl. Gebühr</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">
              {formatEuroFromCents(grossWithFee)}
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
              {salesList.map((order) => {
                const payment = order.payments[0];
                const voided = Boolean(order.voidedAt);
                const cancelled =
                  voided || order.status === "cancelled" || order.status === "refunded";
                const strike = orderCancelledStrikeClass(cancelled);
                const lines = order.items
                  .map((i) => `${i.quantity}× ${i.categorySnapshot}`)
                  .join(", ");
                const customerName =
                  `${order.customer.firstName} ${order.customer.lastName}`.trim();
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
                          {new Date(order.items[0].eventStartsAtSnapshot).toLocaleString(
                            "de-DE",
                            {
                              timeZone: "Europe/Berlin",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
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
          {salesList.length === 0 ? (
            <p className="px-3 py-8 text-center text-[var(--tf-text-secondary)]">
              Keine Tageskasse-Verkäufe
              {fromKey || toKey ? " im gewählten Zeitraum" : ""}
              {eventId ? " für dieses Event" : ""}.
            </p>
          ) : null}
          {hasMoreSales ? (
            <p className="border-t border-[var(--tf-line)] px-3 py-3 text-center text-xs text-[var(--tf-text-secondary)]">
              Mehr als {SALES_LIMIT} Treffer — bitte Zeitraum oder Event eingrenzen.
            </p>
          ) : null}
        </div>
      </section>

      {canSell && !isPartner ? (
        <details className="rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-[var(--tf-navy)]">
            Optional: Kassenschicht (Bar-Anfangs-/Endbestand)
          </summary>
          <p className="mt-2 text-[var(--tf-text-secondary)]">
            Nicht nötig zum Verkaufen. Nur sinnvoll, wenn du den Bargeldbestand in der Kasse
            dokumentieren und am Schichtende abgleichen willst.
          </p>
          <div className="mt-4">
            <BoxOfficeSessionPanel />
          </div>
        </details>
      ) : null}
    </div>
  );
}
