import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const PAID = ["paid", "fulfilled"] as const;

type PeriodAgg = { orders: number; grossCents: number };

async function paidPeriodAgg(
  organizationId: string,
  paidAtGte?: Date,
  paidAtLt?: Date,
): Promise<PeriodAgg> {
  const rows = await prisma.$queryRaw<Array<{ orders: bigint; gross: bigint }>>`
    SELECT COUNT(*)::bigint AS orders,
           COALESCE(SUM(COALESCE(customer_total_cents, gross_cents)), 0)::bigint AS gross
    FROM orders
    WHERE organization_id = ${organizationId}::uuid
      AND status IN ('paid', 'fulfilled')
      ${paidAtGte ? Prisma.sql`AND paid_at >= ${paidAtGte}` : Prisma.empty}
      ${paidAtLt ? Prisma.sql`AND paid_at < ${paidAtLt}` : Prisma.empty}
  `;
  const row = rows[0];
  return {
    orders: Number(row?.orders ?? 0),
    grossCents: Number(row?.gross ?? 0),
  };
}

export async function getSalesStats(organizationId: string) {
  const today = startOfDay();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = startOfWeek();
  const month = startOfMonth();

  const [
    todayAgg,
    yesterdayAgg,
    weekAgg,
    monthAgg,
    allAgg,
    channelRows,
    openFailed,
    recent,
    todayTickets,
    ticketCounts,
  ] = await Promise.all([
    paidPeriodAgg(organizationId, today),
    paidPeriodAgg(organizationId, yesterday, today),
    paidPeriodAgg(organizationId, week),
    paidPeriodAgg(organizationId, month),
    paidPeriodAgg(organizationId),
    prisma.$queryRaw<Array<{ channel: string | null; orders: bigint; gross: bigint }>>`
      SELECT channel,
             COUNT(*)::bigint AS orders,
             COALESCE(SUM(COALESCE(customer_total_cents, gross_cents)), 0)::bigint AS gross
      FROM orders
      WHERE organization_id = ${organizationId}::uuid
        AND status IN ('paid', 'fulfilled')
      GROUP BY channel
    `,
    prisma.order.count({
      where: {
        organizationId,
        status: { in: ["payment_failed", "pending_payment"] },
      },
    }),
    prisma.order.findMany({
      where: { organizationId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        channel: true,
        voidedAt: true,
        grossCents: true,
        customerTotalCents: true,
        paidAt: true,
        createdAt: true,
        customer: { select: { email: true, firstName: true, lastName: true } },
        tickets: { select: { id: true } },
        items: {
          take: 1,
          select: { quantity: true, eventNameSnapshot: true },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { method: true, status: true },
        },
      },
    }),
    prisma.ticket.count({
      where: {
        organizationId,
        issuedAt: { gte: today },
        order: { status: { in: [...PAID] } },
      },
    }),
    prisma.ticket.groupBy({
      by: ["eventId"],
      where: {
        organizationId,
        status: "active",
        order: { status: { in: [...PAID] } },
      },
      _count: { _all: true },
    }),
  ]);

  const eventIds = ticketCounts.map((t) => t.eventId);
  const events =
    eventIds.length === 0
      ? []
      : await prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, name: true },
        });
  const eventName = Object.fromEntries(events.map((e) => [e.id, e.name]));

  const byChannel = channelRows.reduce<Record<string, { orders: number; grossCents: number }>>(
    (acc, row) => {
      const key = row.channel || "online";
      acc[key] = {
        orders: Number(row.orders),
        grossCents: Number(row.gross),
      };
      return acc;
    },
    {},
  );

  return {
    today: {
      orders: todayAgg.orders,
      grossCents: todayAgg.grossCents,
      tickets: todayTickets,
    },
    yesterday: {
      orders: yesterdayAgg.orders,
      grossCents: yesterdayAgg.grossCents,
    },
    week: { orders: weekAgg.orders, grossCents: weekAgg.grossCents },
    month: { orders: monthAgg.orders, grossCents: monthAgg.grossCents },
    all: {
      orders: allAgg.orders,
      grossCents: allAgg.grossCents,
      avgOrderCents: allAgg.orders ? Math.round(allAgg.grossCents / allAgg.orders) : 0,
    },
    /** Orders still waiting for payment or with a failed payment attempt. */
    openOrFailedPayments: openFailed,
    byChannel,
    ticketsByEvent: ticketCounts.map((row) => ({
      eventId: row.eventId,
      eventName: eventName[row.eventId] ?? row.eventId,
      tickets: row._count._all,
    })),
    recentOrders: recent,
  };
}
