import { prisma } from "@/lib/db";
import {
  approxCoordsFromPostal,
  extractOrderPostal,
  resolveHeatmapPeriod,
  type BuyerHeatPoint,
  type HeatmapPeriodKey,
} from "@/lib/admin/buyer-geo";

const PAID = ["paid", "fulfilled"] as const;

export async function loadBuyerHeatmapPoints(opts: {
  organizationId: string;
  eventId?: string | null;
  period?: string | null;
  from?: string | null;
  to?: string | null;
  take?: number;
}): Promise<{
  points: BuyerHeatPoint[];
  orderCount: number;
  withGeo: number;
  periodLabel: string;
  periodKey: HeatmapPeriodKey;
}> {
  const period = resolveHeatmapPeriod({
    period: opts.period,
    from: opts.from,
    to: opts.to,
  });

  const orders = await prisma.order.findMany({
    where: {
      organizationId: opts.organizationId,
      status: { in: [...PAID] },
      ...(period.from || period.to
        ? {
            OR: [
              {
                paidAt: {
                  ...(period.from ? { gte: period.from } : {}),
                  ...(period.to ? { lt: period.to } : {}),
                },
              },
              {
                AND: [
                  { paidAt: null },
                  {
                    createdAt: {
                      ...(period.from ? { gte: period.from } : {}),
                      ...(period.to ? { lt: period.to } : {}),
                    },
                  },
                ],
              },
            ],
          }
        : {}),
      ...(opts.eventId
        ? { items: { some: { eventId: opts.eventId } } }
        : {}),
    },
    select: {
      id: true,
      invoicePostalCode: true,
      invoiceCity: true,
      invoiceCountry: true,
      billingSnapshot: true,
      customer: {
        select: { postalCode: true, city: true, country: true },
      },
      tickets: opts.eventId
        ? { where: { eventId: opts.eventId }, select: { id: true } }
        : { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 2000,
  });

  const byKey = new Map<string, BuyerHeatPoint>();
  let withGeo = 0;

  for (const order of orders) {
    const loc = extractOrderPostal(order);
    const coords = approxCoordsFromPostal(loc);
    if (!coords) continue;
    withGeo += 1;
    const weight = Math.max(1, order.tickets.length);
    const prefix = (loc.postalCode ?? "").slice(0, 2);
    const key = `${prefix}:${coords.lat.toFixed(3)}:${coords.lng.toFixed(3)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.weight += weight;
      if (!existing.city && loc.city) existing.city = loc.city;
    } else {
      byKey.set(key, {
        lat: coords.lat,
        lng: coords.lng,
        weight,
        city: loc.city,
        postalPrefix: prefix,
      });
    }
  }

  return {
    points: [...byKey.values()],
    orderCount: orders.length,
    withGeo,
    periodLabel: period.label,
    periodKey: period.key,
  };
}
