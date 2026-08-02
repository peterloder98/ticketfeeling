import { prisma } from "@/lib/db";

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

export async function getSalesStats(organizationId: string) {
  const today = startOfDay();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = startOfWeek();
  const month = startOfMonth();

  const paidWhere = {
    organizationId,
    status: { in: [...PAID] },
  };

  const [todayOrders, yesterdayOrders, weekOrders, monthOrders, allPaid, openFailed, recent] =
    await Promise.all([
      prisma.order.findMany({
        where: { ...paidWhere, paidAt: { gte: today } },
        select: { grossCents: true, id: true },
      }),
      prisma.order.findMany({
        where: { ...paidWhere, paidAt: { gte: yesterday, lt: today } },
        select: { grossCents: true, id: true },
      }),
      prisma.order.findMany({
        where: { ...paidWhere, paidAt: { gte: week } },
        select: { grossCents: true },
      }),
      prisma.order.findMany({
        where: { ...paidWhere, paidAt: { gte: month } },
        select: { grossCents: true },
      }),
      prisma.order.findMany({
        where: paidWhere,
        select: { id: true, grossCents: true, channel: true },
      }),
      prisma.order.count({
        where: {
          organizationId,
          status: { in: ["payment_failed", "pending_payment"] },
        },
      }),
      prisma.order.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { customer: true, tickets: true },
      }),
    ]);

  const sum = (rows: { grossCents: number }[]) =>
    rows.reduce((s, r) => s + r.grossCents, 0);

  const ticketCounts = await prisma.ticket.groupBy({
    by: ["eventId"],
    where: {
      organizationId,
      status: "active",
      order: { status: { in: [...PAID] } },
    },
    _count: { _all: true },
  });

  const eventIds = ticketCounts.map((t) => t.eventId);
  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, name: true },
  });
  const eventName = Object.fromEntries(events.map((e) => [e.id, e.name]));

  const byChannel = allPaid.reduce<Record<string, { orders: number; grossCents: number }>>(
    (acc, order) => {
      const key = order.channel || "online";
      acc[key] ??= { orders: 0, grossCents: 0 };
      acc[key].orders += 1;
      acc[key].grossCents += order.grossCents;
      return acc;
    },
    {},
  );

  const pools = await prisma.inventoryPool.findMany({
    where: { event: { organizationId } },
    include: { category: true, event: true },
  });

  return {
    today: {
      orders: todayOrders.length,
      grossCents: sum(todayOrders),
      tickets: await prisma.ticket.count({
        where: {
          organizationId,
          issuedAt: { gte: today },
          order: { status: { in: [...PAID] } },
        },
      }),
    },
    yesterday: {
      orders: yesterdayOrders.length,
      grossCents: sum(yesterdayOrders),
    },
    week: { orders: weekOrders.length, grossCents: sum(weekOrders) },
    month: { orders: monthOrders.length, grossCents: sum(monthOrders) },
    all: {
      orders: allPaid.length,
      grossCents: sum(allPaid),
      avgOrderCents: allPaid.length ? Math.round(sum(allPaid) / allPaid.length) : 0,
    },
    openOrFailedPayments: openFailed,
    byChannel,
    ticketsByEvent: ticketCounts.map((row) => ({
      eventId: row.eventId,
      eventName: eventName[row.eventId] ?? row.eventId,
      tickets: row._count._all,
    })),
    inventory: pools.map((pool) => ({
      eventId: pool.eventId,
      eventName: pool.event.name,
      categoryName: pool.category.name,
      channel: pool.channel,
      capacity: pool.capacity,
      sold: pool.soldQuantity,
      held: pool.heldQuantity,
      available: Math.max(0, pool.capacity - pool.soldQuantity - pool.heldQuantity),
    })),
    recentOrders: recent,
  };
}
