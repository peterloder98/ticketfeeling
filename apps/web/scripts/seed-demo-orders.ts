/**
 * One-off / reusable: seed a few paid demo orders per live event.
 *
 * Usage (production DB — be careful):
 *   npx vercel env pull /tmp/tf-prod.env --environment production --yes
 *   set -a && source /tmp/tf-prod.env && set +a
 *   cd apps/web && npx tsx scripts/seed-demo-orders.ts
 *
 * Options:
 *   --force     also seed events that already have demo orders
 *   --dry-run   print plan only
 *
 * Buyers use @ticketfeeling-test.local / @example.test — never real SMTP.
 * Orders are marked contractSnapshot.demo=true; post-fulfill emails are skipped.
 * No Stripe charges — payment provider row is "dev" / already paid.
 */
import { PrismaClient } from "@prisma/client";
import { createDemoPaidOrder, type DemoBuyer } from "../src/lib/commerce/create-demo-order";
import { signOrderAccessToken } from "../src/lib/commerce/order-access";
import { SALE_RELEASED_STATUSES } from "../src/lib/commerce/event-sale";

const prisma = new PrismaClient();

const FIRST_NAMES = [
  "Anna",
  "Max",
  "Laura",
  "Jonas",
  "Sophie",
  "Tim",
  "Mia",
  "Leon",
  "Emma",
  "Paul",
];
const LAST_NAMES = [
  "Muster",
  "Beispiel",
  "Testmann",
  "Demofrau",
  "Probe",
  "Sample",
  "Fiktiv",
  "Sandbox",
];
const STREETS = [
  "Musterstraße",
  "Beispielweg",
  "Testallee",
  "Demoplatz",
  "Probeweg",
];
const CITIES: { postalCode: string; city: string }[] = [
  { postalCode: "80331", city: "München" },
  { postalCode: "10115", city: "Berlin" },
  { postalCode: "20095", city: "Hamburg" },
  { postalCode: "50667", city: "Köln" },
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
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${seed}@ticketfeeling-test.local`;
  return {
    email,
    firstName,
    lastName,
    street,
    houseNumber: String(1 + (seed % 40)),
    postalCode: place.postalCode,
    city: place.city,
  };
}

function appBase() {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://ticketfeeling-web.vercel.app"
  );
}

async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — pull Vercel env first.");
    process.exit(1);
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL).hostname;
    } catch {
      return "?";
    }
  })();
  console.log(`[demo-seed] DATABASE host=${host} force=${force} dryRun=${dryRun}`);

  const events = await prisma.event.findMany({
    where: {
      OR: [
        { status: { in: [...SALE_RELEASED_STATUSES] } },
        {
          ticketCategories: { some: { status: "active" } },
          status: { in: ["presale_active", "published", "announcement"] },
        },
      ],
    },
    include: {
      ticketCategories: {
        where: { status: "active" },
        include: { pools: true },
        orderBy: { sortOrder: "asc" },
      },
      location: { select: { name: true, city: true } },
    },
    orderBy: { eventStartsAt: "asc" },
  });

  const eligible = events.filter((e) => e.ticketCategories.length > 0);
  console.log(`[demo-seed] events with categories: ${eligible.length}`);

  const base = appBase();
  const report: {
    event: string;
    orderNumber: string;
    orderId: string;
    tickets: number;
    adminUrl: string;
    orderUrl: string;
    ticketUrls: string[];
  }[] = [];

  let seedCounter = Date.now() % 10_000;

  for (const event of eligible) {
    const existingDemo = await prisma.order.count({
      where: {
        items: { some: { eventId: event.id } },
        contractSnapshot: {
          path: ["demo"],
          equals: true,
        },
      },
    });
    if (existingDemo > 0 && !force) {
      console.log(
        `[demo-seed] skip ${event.name} (${event.slug}) — already has ${existingDemo} demo order(s)`,
      );
      continue;
    }

    const category =
      event.ticketCategories.find((c) =>
        c.pools.some((p) => p.capacity - p.soldQuantity - p.heldQuantity > 0),
      ) ?? event.ticketCategories[0]!;

    const ordersForEvent = 1 + (seedCounter % 2); // 1 or 2
    for (let o = 0; o < ordersForEvent; o += 1) {
      seedCounter += 1;
      const qty = 1 + (seedCounter % 3); // 1–3
      const buyer = makeBuyer(seedCounter);
      const demoKey = `demo:${event.id}:${o}:${buyer.email}`;

      const already = await prisma.payment.findFirst({
        where: { provider: "dev", providerPaymentId: `demo_${demoKey}` },
        select: { orderId: true },
      });
      if (already && !force) {
        console.log(`[demo-seed] skip existing demoKey ${demoKey}`);
        continue;
      }

      console.log(
        `[demo-seed] ${dryRun ? "DRY " : ""}event=${event.slug} cat=${category.name} qty=${qty} buyer=${buyer.email}`,
      );
      if (dryRun) continue;

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
        const orderUrl = `${base}/konto/bestellung/${created.orderId}${tParam}`;
        const adminUrl = `${base}/admin/orders/${created.orderId}`;
        const ticketUrls = tickets.map(
          (t) => `${base}/ticket/${t.id}${tParam}`,
        );

        report.push({
          event: event.name,
          orderNumber: created.orderNumber,
          orderId: created.orderId,
          tickets: tickets.length,
          adminUrl,
          orderUrl,
          ticketUrls,
        });
        console.log(
          `[demo-seed] OK ${created.orderNumber} tickets=${tickets.length} ${orderUrl}`,
        );
      } catch (error) {
        console.error(
          `[demo-seed] FAILED ${event.slug}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  console.log("\n=== Demo orders (inspect tickets + QR) ===\n");
  for (const row of report) {
    console.log(`Event: ${row.event}`);
    console.log(`  Order ${row.orderNumber} (${row.tickets} tickets)`);
    console.log(`  Admin:  ${row.adminUrl}`);
    console.log(`  Order:  ${row.orderUrl}`);
    for (const u of row.ticketUrls) console.log(`  Ticket: ${u}`);
    console.log("");
  }
  console.log(`[demo-seed] created ${report.length} order(s)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
