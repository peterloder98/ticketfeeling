import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { BoxOfficeNewSaleButton } from "@/components/box-office-new-sale-button";
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
import { formatDeDateTime } from "@/lib/datetime-de";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { channelAvailableQuantity } from "@/lib/commerce/inventory-availability";
import { resolveSellableCategoryCapacity } from "@/lib/seating/sync-category-capacity";
import { categoryNeedsSeats } from "@/lib/seating/types";
import { BoxOfficeVoidButton } from "@/components/box-office-sale-row-actions";
import { SmartDateInput } from "@/components/admin/smart-date-input";
import { releaseDuePresales } from "@/lib/commerce/ensure-presale-release";
import { mergeSameCategoryLines } from "@/lib/commerce/merge-category-lines";
import { countBoxOfficeSaleTickets } from "@/lib/commerce/box-office-ticket-count";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";

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

  // Due Vorverkaufsstart → Im Verkauf so Kasse query (presale_active/published) sees them.
  await releaseDuePresales({ organizationId: membership.organizationId });

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

  const partnerSaleFilter = fullAccess ? {} : { soldByUserId: session.user.id };

  const [orgSettings, events, filterEvents, orders] = await Promise.all([
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
        tickets: {
          select: {
            id: true,
            ticketNumber: true,
            categorySnapshot: true,
            status: true,
            presence: true,
            seatLabel: true,
            seatRow: true,
            seatNumber: true,
            blockLabel: true,
          },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  const hasMoreSales = orders.length > SALES_LIMIT;
  const salesList = hasMoreSales ? orders.slice(0, SALES_LIMIT) : orders;

  // Paid Tageskasse rows with positions but no ticket rows (fulfillment gap) —
  // mint tickets so Beleg count and Storno work.
  const ticketSelect = {
    id: true,
    orderId: true,
    ticketNumber: true,
    categorySnapshot: true,
    status: true,
    presence: true,
    seatLabel: true,
    seatRow: true,
    seatNumber: true,
    blockLabel: true,
  } as const;
  const missingTicketOrders = salesList.filter(
    (o) =>
      !o.voidedAt &&
      o.tickets.length === 0 &&
      o.items.some((i) => i.quantity > 0) &&
      (o.status === "paid" || o.status === "fulfilled"),
  );
  if (missingTicketOrders.length > 0) {
    await Promise.all(
      missingTicketOrders.map((o) =>
        fulfillPaidOrder(o.id).catch((err) => {
          console.error("[kasse] fulfill repair failed", o.orderNumber, err);
          return null;
        }),
      ),
    );
    const repaired = await prisma.ticket.findMany({
      where: { orderId: { in: missingTicketOrders.map((o) => o.id) } },
      select: ticketSelect,
    });
    const byOrder = new Map<string, typeof salesList[number]["tickets"]>();
    for (const t of repaired) {
      const { orderId, ...ticket } = t;
      const list = byOrder.get(orderId) ?? [];
      list.push(ticket);
      byOrder.set(orderId, list);
    }
    for (const order of salesList) {
      const tickets = byOrder.get(order.id);
      if (tickets?.length) {
        order.tickets = tickets;
      }
    }
  }

  const feeConfig = resolveActivePlatformFeeConfig(orgSettings?.platformFeeConfig);
  const now = Date.now();

  const seatingEventIds = events
    .filter(
      (event) =>
        Boolean(event.venuePlanId) &&
        (event.seatingBookingMode === "best_available" ||
          event.seatingBookingMode === "seat_map_and_best"),
    )
    .map((e) => e.id);
  const assignedSeats =
    seatingEventIds.length > 0
      ? await prisma.eventSeat.findMany({
          where: {
            eventId: { in: seatingEventIds },
            locked: false,
            categoryId: { not: null },
          },
          select: { eventId: true, categoryId: true },
        })
      : [];
  const seatCountByEventCategory = new Map<string, number>();
  for (const seat of assignedSeats) {
    if (!seat.categoryId) continue;
    const key = `${seat.eventId}:${seat.categoryId}`;
    seatCountByEventCategory.set(key, (seatCountByEventCategory.get(key) ?? 0) + 1);
  }

  const { ensureEventPricingSchema } = await import(
    "@/lib/commerce/ensure-event-pricing-schema"
  );
  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const { resolveTicketUnitPrice } = await import("@/lib/commerce/event-pricing");
  await ensureEventPricingSchema(prisma);

  const campaignsByEvent = new Map<
    string,
    Awaited<ReturnType<typeof loadEventPriceCampaigns>>
  >();
  await Promise.all(
    events.map(async (event) => {
      campaignsByEvent.set(event.id, await loadEventPriceCampaigns(event.id));
    }),
  );
  const priceNow = new Date();

  const payload = events.map((event) => {
    const hasReservedSeating =
      Boolean(event.venuePlanId) &&
      (event.seatingBookingMode === "best_available" ||
        event.seatingBookingMode === "seat_map_and_best");
    const campaigns = campaignsByEvent.get(event.id) ?? [];
    const accessibilityOffer = accessibilityOfferFromEvent(event);
    return {
      id: event.id,
      name: event.name,
      whenLabel: event.eventStartsAt
        ? formatDeDateTime(event.eventStartsAt, {
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
      hasReservedSeating,
      seatingBookingMode: event.seatingBookingMode as
        | "none"
        | "best_available"
        | "seat_map_and_best",
      accessibilityOffer: accessibilityOffer.enabled
        ? {
            label: accessibilityOffer.label,
            type: accessibilityOffer.type,
            value: accessibilityOffer.value,
          }
        : null,
      categories: event.ticketCategories.map((category) => {
        const sellableCapacity = resolveSellableCategoryCapacity({
          categoryCapacity: category.capacity,
          categoryKind: category.categoryKind,
          freeSeating: category.freeSeating,
          seatingBookingMode: event.seatingBookingMode,
          assignedUnlockedSeatCount: hasReservedSeating
            ? (seatCountByEventCategory.get(`${event.id}:${category.id}`) ?? 0)
            : null,
        });
        const channel = category.pools.some((p) => p.channel === "box_office")
          ? "box_office"
          : "online";
        const available = category.pools.length
          ? channelAvailableQuantity(category.pools, channel, sellableCapacity)
          : Math.max(0, sellableCapacity - category.safetyReserve);
        let saleLabel: string | null = null;
        if (category.saleEndsAt && category.saleEndsAt.getTime() > now) {
          saleLabel = "Zeitlich begrenzt";
        } else if (category.saleStartsAt && category.saleStartsAt.getTime() > now) {
          saleLabel = "Verkauf startet später";
        }
        const needsSeats = categoryNeedsSeats({
          seatingBookingMode: event.seatingBookingMode,
          categoryKind: category.categoryKind,
          freeSeating: category.freeSeating,
        });
        const priced = resolveTicketUnitPrice({
          listCents: category.priceGrossCents,
          categoryId: category.id,
          channel: "box_office",
          now: priceNow,
          campaigns,
          accessibility: accessibilityOffer,
          accessibilitySelected: false,
        });
        return {
          id: category.id,
          name: category.name,
          description: category.description,
          priceGrossCents: priced.unitCents,
          listPriceGrossCents: priced.listCents,
          campaignName: priced.campaignName,
          campaignValidUntil: priced.campaignValidUntil,
          available,
          maxPerOrder: category.maxPerOrder,
          saleLabel,
          needsSeats,
          categoryKind: category.categoryKind,
          companionFree: category.companionFree,
        };
      }),
    };
  });

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
                ? `Verkäufe einsehen, drucken und stornieren. ${channelShortHint("box_office")}.`
                : "Übersicht aller Tageskasse-Verkäufe."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSell ? (
            <BoxOfficeNewSaleButton
              events={payload}
              feeConfig={{
                enabled: feeConfig.enabled,
                percentageBasisPoints: feeConfig.percentageBasisPoints,
                displayName: feeConfig.displayName,
              }}
            />
          ) : null}
          {fullAccess ? (
            <Link href="/admin/partner" className="tf-btn tf-btn-secondary !py-2 text-sm">
              Partner einladen
            </Link>
          ) : null}
        </div>
      </div>
      {!isPartner ? <AdminSubnav items={ADMIN_SUBNAV.verkauf} /> : null}

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
            Standard: alle Verkäufe{rangeHint}. Optional nach Zeitraum und Event filtern.
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
              Alle anzeigen
            </Link>
          ) : null}
        </form>

        <div className="w-full overflow-x-auto rounded-2xl border border-[var(--tf-line)] bg-white">
          <table className="w-full min-w-[880px] text-left text-sm">
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
                const lines = mergeSameCategoryLines(
                  order.items.map((i) => ({
                    quantity: i.quantity,
                    categoryLabel: i.categorySnapshot,
                    unitPriceCents: i.unitPaidGrossCents || i.unitListGrossCents,
                    lineGrossCents: i.grossCents,
                    eventKey: i.eventId,
                  })),
                )
                  .map((l) => `${l.quantity}× ${l.categoryLabel}`)
                  .join(", ");
                const customerName =
                  `${order.customer.firstName} ${order.customer.lastName}`.trim();
                const customerEmail = order.customer.email.includes("@ticketfeeling.local")
                  ? null
                  : order.customer.email;
                const activeTicketCount = countBoxOfficeSaleTickets(order);

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
                        className="tf-link font-semibold underline underline-offset-2"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-[var(--tf-text-secondary)]">
                        {activeTicketCount} Ticket{activeTicketCount === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className={`px-3 py-3 ${strike}`}>
                      <p className="font-medium text-[var(--tf-navy)]">
                        {order.items[0]?.eventNameSnapshot ?? "—"}
                      </p>
                      {order.items[0]?.eventStartsAtSnapshot ? (
                        <p className="text-[11px] text-[var(--tf-text-secondary)]">
                          {formatDeDateTime(new Date(order.items[0].eventStartsAtSnapshot), {
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
                    <td className="px-3 py-3 text-center">
                      <BoxOfficeVoidButton
                        orderId={order.id}
                        orderNumber={order.orderNumber}
                        voided={voided}
                        tickets={order.tickets}
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
