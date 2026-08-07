import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { createDemoPaidOrder, type DemoBuyer } from "@/lib/commerce/create-demo-order";
import { signOrderAccessToken } from "@/lib/commerce/order-access";
import { SALE_RELEASED_STATUSES } from "@/lib/commerce/event-sale";
import { allowDevPaymentsInProduction } from "@/lib/payments/mode";
import { getPublicAppUrl } from "@/lib/embed/public-url";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  try {
    return timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function authorized(request: Request) {
  const expected = process.env.DEMO_SEED_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const alt = request.headers.get("x-demo-seed-secret")?.trim() ?? "";
  return safeEqual(bearer || alt, expected);
}

const FIRST_NAMES = ["Anna", "Max", "Laura", "Jonas", "Sophie", "Tim", "Mia", "Leon"];
const LAST_NAMES = ["Muster", "Beispiel", "Testmann", "Demofrau", "Probe", "Sample"];
const STREETS = ["Musterstraße", "Beispielweg", "Testallee", "Demoplatz"];
const CITIES = [
  { postalCode: "80331", city: "München" },
  { postalCode: "10115", city: "Berlin" },
  { postalCode: "20095", city: "Hamburg" },
  { postalCode: "84028", city: "Landshut" },
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function makeBuyer(seed: number): DemoBuyer {
  const firstName = pick(FIRST_NAMES, seed);
  const lastName = pick(LAST_NAMES, seed * 3 + 1);
  const street = pick(STREETS, seed * 5 + 2);
  const place = pick(CITIES, seed * 7 + 3);
  return {
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${seed}@ticketfeeling-test.local`,
    firstName,
    lastName,
    street,
    houseNumber: String(1 + (seed % 40)),
    postalCode: place.postalCode,
    city: place.city,
  };
}

/**
 * Temporary admin seed: create a few paid demo orders with real tickets/QR.
 * Requires ALLOW_DEV_PAYMENTS=1 and Authorization: Bearer $DEMO_SEED_SECRET.
 */
export async function POST(request: Request) {
  if (!allowDevPaymentsInProduction() && process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: { code: "GONE" } }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const base = getPublicAppUrl();
  const report: {
    event: string;
    orderNumber: string;
    orderId: string;
    tickets: number;
    adminUrl: string;
    orderUrl: string;
    ticketUrls: string[];
  }[] = [];

  const events = await prisma.event.findMany({
    where: {
      status: { in: [...SALE_RELEASED_STATUSES, "announcement"] },
      ticketCategories: { some: { status: "active" } },
    },
    include: {
      ticketCategories: {
        where: { status: "active" },
        include: { pools: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { eventStartsAt: "asc" },
  });

  let seedCounter = Date.now() % 10_000;

  for (const event of events) {
    if (!event.ticketCategories.length) continue;

    const existingDemo = await prisma.order.count({
      where: {
        items: { some: { eventId: event.id } },
        contractSnapshot: { path: ["demo"], equals: true },
      },
    });
    if (existingDemo > 0 && !force) continue;

    const category =
      event.ticketCategories.find((c) =>
        c.pools.some((p) => p.capacity - p.soldQuantity - p.heldQuantity > 0),
      ) ?? event.ticketCategories[0]!;

    const ordersForEvent = 1 + (seedCounter % 2);
    for (let o = 0; o < ordersForEvent; o += 1) {
      seedCounter += 1;
      const qty = 1 + (seedCounter % 3);
      const buyer = makeBuyer(seedCounter);
      const demoKey = `demo:${event.id}:${o}:${buyer.email}`;

      const already = await prisma.payment.findFirst({
        where: { provider: "dev", providerPaymentId: `demo_${demoKey}` },
        select: { orderId: true },
      });
      if (already && !force) continue;

      try {
        const created = await createDemoPaidOrder({
          organizationId: event.organizationId,
          eventId: event.id,
          categoryId: category.id,
          quantity: qty,
          buyer,
          demoKey,
        });
        const tickets = await prisma.ticket.findMany({
          where: { orderId: created.orderId },
          select: { id: true },
          orderBy: { ticketNumber: "asc" },
        });
        const access = signOrderAccessToken(created.orderId, 7 * 24 * 60 * 60 * 1000);
        const tParam = access ? `?t=${encodeURIComponent(access)}` : "";
        report.push({
          event: event.name,
          orderNumber: created.orderNumber,
          orderId: created.orderId,
          tickets: tickets.length,
          adminUrl: `${base}/admin/orders/${created.orderId}`,
          orderUrl: `${base}/konto/bestellung/${created.orderId}${tParam}`,
          ticketUrls: tickets.map((t) => `${base}/ticket/${t.id}${tParam}`),
        });
      } catch (error) {
        report.push({
          event: event.name,
          orderNumber: "FAILED",
          orderId: "",
          tickets: 0,
          adminUrl: "",
          orderUrl: error instanceof Error ? error.message : String(error),
          ticketUrls: [],
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    created: report.filter((r) => r.orderId).length,
    orders: report,
  });
}
