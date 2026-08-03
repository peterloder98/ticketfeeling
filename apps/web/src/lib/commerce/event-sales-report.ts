import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

const PAID = ["paid", "fulfilled"] as const;

export type CategorySalesRow = {
  categoryId: string;
  name: string;
  priceGrossCents: number;
  capacity: number;
  onlineSold: number;
  boxOfficeSold: number;
  totalSold: number;
  remaining: number;
  revenueCents: number;
};

export type EventSalesReport = {
  eventId: string;
  capacity: number;
  sold: number;
  remaining: number;
  revenueCents: number;
  onlineSold: number;
  boxOfficeSold: number;
  categories: CategorySalesRow[];
  /** Tickets sold per calendar day (Berlin) since sale start */
  timeline: { date: string; tickets: number; revenueCents: number; cumulative: number }[];
  pie: { label: string; value: number; color: string }[];
};

function berlinDayKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

export async function getEventListSales(
  organizationId: string,
  opts?: { statuses?: string[] },
) {
  const events = await prisma.event.findMany({
    where: {
      organizationId,
      ...(opts?.statuses?.length ? { status: { in: opts.statuses } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      eventStartsAt: true,
      location: { select: { name: true, city: true } },
      ticketCategories: {
        select: {
          id: true,
          capacity: true,
          name: true,
        },
      },
    },
    orderBy: [{ eventStartsAt: "asc" }, { name: "asc" }],
  });

  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return [];

  // Aggregate in SQL instead of pulling every order line into Node.
  // Cast params to uuid — Postgres rejects uuid = text (Prisma binds strings as text).
  const sales = await prisma.$queryRaw<
    Array<{
      event_id: string;
      sold: bigint | number;
      revenue_cents: bigint | number;
      online_sold: bigint | number;
      box_office_sold: bigint | number;
    }>
  >`
    SELECT oi.event_id,
           COALESCE(SUM(oi.quantity), 0) AS sold,
           COALESCE(SUM(oi.gross_cents), 0) AS revenue_cents,
           COALESCE(SUM(CASE WHEN o.channel = 'box_office' THEN 0 ELSE oi.quantity END), 0) AS online_sold,
           COALESCE(SUM(CASE WHEN o.channel = 'box_office' THEN oi.quantity ELSE 0 END), 0) AS box_office_sold
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE oi.event_id IN (${Prisma.join(eventIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND o.organization_id = ${organizationId}::uuid
      AND o.status IN (${Prisma.join([...PAID])})
    GROUP BY oi.event_id
  `;

  const byEvent = new Map<
    string,
    { sold: number; revenueCents: number; online: number; boxOffice: number }
  >();

  for (const row of sales) {
    byEvent.set(row.event_id, {
      sold: Number(row.sold),
      revenueCents: Number(row.revenue_cents),
      online: Number(row.online_sold),
      boxOffice: Number(row.box_office_sold),
    });
  }

  return events.map((event) => {
    const capacity = event.ticketCategories.reduce((s, c) => s + c.capacity, 0);
    const stats = byEvent.get(event.id) ?? {
      sold: 0,
      revenueCents: 0,
      online: 0,
      boxOffice: 0,
    };
    return {
      ...event,
      capacity,
      sold: stats.sold,
      remaining: Math.max(0, capacity - stats.sold),
      revenueCents: stats.revenueCents,
      onlineSold: stats.online,
      boxOfficeSold: stats.boxOffice,
      categoryCount: event.ticketCategories.length,
    };
  });
}

export async function getEventSalesReport(eventId: string): Promise<EventSalesReport> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      id: true,
      createdAt: true,
      presaleStartsAt: true,
      ticketCategories: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          priceGrossCents: true,
          capacity: true,
        },
      },
    },
  });

  const items = await prisma.orderItem.findMany({
    where: {
      eventId,
      order: { status: { in: [...PAID] } },
    },
    select: {
      categoryId: true,
      categorySnapshot: true,
      quantity: true,
      grossCents: true,
      order: { select: { channel: true, paidAt: true, createdAt: true } },
    },
  });

  const catMap = new Map<
    string,
    { onlineSold: number; boxOfficeSold: number; revenueCents: number; name: string }
  >();

  for (const cat of event.ticketCategories) {
    catMap.set(cat.id, {
      onlineSold: 0,
      boxOfficeSold: 0,
      revenueCents: 0,
      name: cat.name,
    });
  }

  const dayMap = new Map<string, { tickets: number; revenueCents: number }>();

  for (const item of items) {
    const key = item.categoryId ?? `snap:${item.categorySnapshot}`;
    const existing = catMap.get(key) ?? {
      onlineSold: 0,
      boxOfficeSold: 0,
      revenueCents: 0,
      name: item.categorySnapshot,
    };
    if (item.order.channel === "box_office") existing.boxOfficeSold += item.quantity;
    else existing.onlineSold += item.quantity;
    existing.revenueCents += item.grossCents;
    catMap.set(key, existing);

    const when = item.order.paidAt ?? item.order.createdAt;
    const day = berlinDayKey(when);
    const d = dayMap.get(day) ?? { tickets: 0, revenueCents: 0 };
    d.tickets += item.quantity;
    d.revenueCents += item.grossCents;
    dayMap.set(day, d);
  }

  const categories: CategorySalesRow[] = event.ticketCategories.map((cat) => {
    const s = catMap.get(cat.id) ?? {
      onlineSold: 0,
      boxOfficeSold: 0,
      revenueCents: 0,
      name: cat.name,
    };
    const totalSold = s.onlineSold + s.boxOfficeSold;
    return {
      categoryId: cat.id,
      name: cat.name,
      priceGrossCents: cat.priceGrossCents,
      capacity: cat.capacity,
      onlineSold: s.onlineSold,
      boxOfficeSold: s.boxOfficeSold,
      totalSold,
      remaining: Math.max(0, cat.capacity - totalSold),
      revenueCents: s.revenueCents,
    };
  });

  const knownIds = new Set(event.ticketCategories.map((c) => c.id));
  for (const [key, s] of catMap) {
    if (knownIds.has(key)) continue;
    const totalSold = s.onlineSold + s.boxOfficeSold;
    if (totalSold === 0) continue;
    categories.push({
      categoryId: key,
      name: s.name,
      priceGrossCents: 0,
      capacity: totalSold,
      onlineSold: s.onlineSold,
      boxOfficeSold: s.boxOfficeSold,
      totalSold,
      remaining: 0,
      revenueCents: s.revenueCents,
    });
  }

  const capacity = categories.reduce((s, c) => s + c.capacity, 0);
  const sold = categories.reduce((s, c) => s + c.totalSold, 0);
  const revenueCents = categories.reduce((s, c) => s + c.revenueCents, 0);
  const onlineSold = categories.reduce((s, c) => s + c.onlineSold, 0);
  const boxOfficeSold = categories.reduce((s, c) => s + c.boxOfficeSold, 0);

  const saleStart =
    event.presaleStartsAt ??
    event.createdAt;
  const startKey = berlinDayKey(saleStart);
  const todayKey = berlinDayKey(new Date());

  const timeline: EventSalesReport["timeline"] = [];
  const cursor = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${todayKey}T12:00:00`);
  let cumulative = 0;
  // Cap timeline span to avoid huge arrays
  const maxDays = 120;
  let days = 0;
  while (cursor <= end && days < maxDays) {
    const key = berlinDayKey(cursor);
    const day = dayMap.get(key) ?? { tickets: 0, revenueCents: 0 };
    cumulative += day.tickets;
    timeline.push({
      date: key,
      tickets: day.tickets,
      revenueCents: day.revenueCents,
      cumulative,
    });
    cursor.setDate(cursor.getDate() + 1);
    days += 1;
  }

  // If sale start is far in future or empty, still show last sales days
  if (timeline.length === 0 && dayMap.size > 0) {
    const keys = [...dayMap.keys()].sort();
    let cum = 0;
    for (const key of keys) {
      const day = dayMap.get(key)!;
      cum += day.tickets;
      timeline.push({
        date: key,
        tickets: day.tickets,
        revenueCents: day.revenueCents,
        cumulative: cum,
      });
    }
  }

  const remaining = Math.max(0, capacity - sold);
  const pie = [
    { label: "Online-Shop", value: onlineSold, color: "#14B8A6" },
    { label: "Tageskasse", value: boxOfficeSold, color: "#0F2747" },
    { label: "Noch frei", value: remaining, color: "#CBD5E1" },
  ].filter((p) => p.value > 0);

  if (pie.length === 0) {
    pie.push({ label: "Noch frei", value: Math.max(capacity, 1), color: "#CBD5E1" });
  }

  return {
    eventId,
    capacity,
    sold,
    remaining,
    revenueCents,
    onlineSold,
    boxOfficeSold,
    categories,
    timeline,
    pie,
  };
}
