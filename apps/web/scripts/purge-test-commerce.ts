/**
 * Aggressive cleanup for schlagerfeeling org (Ticketfeeling):
 * 1) Delete ALL purchased orders/tickets (and related soft refs) in the org
 * 2) Delete ALL events EXCEPT:
 *    - SCHLAGERfeeling Weihnachtstraum tour dates
 *    - Schlagernacht der Herzen
 * 3) Clear scheduleChangedAt on Löwenberg Weihnachtstraum (test notice)
 *
 * Safety: only organization slug `schlagerfeeling`. Idempotent.
 *
 * Usage:
 *   cd apps/web && npx tsx scripts/purge-test-commerce.ts --dry-run
 *   cd apps/web && npx tsx scripts/purge-test-commerce.ts
 *
 * Production:
 *   npx vercel env pull /tmp/tf-prod.env --environment production --yes
 *   set -a && source /tmp/tf-prod.env && set +a
 *   cd apps/web && npx tsx scripts/purge-test-commerce.ts --dry-run
 *   cd apps/web && npx tsx scripts/purge-test-commerce.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG_SLUG = "schlagerfeeling";
const KEEP_TOUR_SLUG = "schlagerfeeling-weihnachtstraum-2026";
const KEEP_EVENT_SLUG_PREFIX = "schlagerfeeling-weihnachtstraum-2026";
const KEEP_STANDALONE_SLUGS = ["schlagernacht-der-herzen-2027"] as const;
const LOEWENBERG_SLUG = "schlagerfeeling-weihnachtstraum-2026-loewenberg";

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — pull Vercel env first for production.");
    process.exit(1);
  }

  console.log(`[purge] host=${hostOf(process.env.DATABASE_URL)} dryRun=${dryRun}`);

  const org = await prisma.organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`Organization ${ORG_SLUG} not found — abort.`);
    process.exit(1);
  }
  console.log(`[purge] org=${org.name} (${org.slug}) id=${org.id}`);

  const keepTour = await prisma.tour.findFirst({
    where: { organizationId: org.id, slug: KEEP_TOUR_SLUG },
    select: { id: true, name: true, slug: true },
  });

  const keepEvents = await prisma.event.findMany({
    where: {
      organizationId: org.id,
      OR: [
        ...(keepTour ? [{ tourId: keepTour.id }] : []),
        { slug: { startsWith: KEEP_EVENT_SLUG_PREFIX } },
        { slug: { in: [...KEEP_STANDALONE_SLUGS] } },
        { name: { contains: "Schlagernacht der Herzen", mode: "insensitive" } },
      ],
      NOT: [{ slug: { endsWith: "-legacy" } }],
    },
    select: { id: true, slug: true, name: true, tourId: true },
  });
  const keepEventIds = new Set(keepEvents.map((e) => e.id));
  console.log(
    `[purge] keep events (${keepEvents.length}):`,
    keepEvents.map((e) => e.slug).join(", ") || "(none)",
  );

  // ——— 1) All orders in org (purchased / any status) ———
  const orders = await prisma.order.findMany({
    where: { organizationId: org.id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customerId: true,
      _count: { select: { tickets: true, items: true, payments: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[purge] orders to delete: ${orders.length}`);

  for (const order of orders) {
    console.log(
      `  ${dryRun ? "DRY " : ""}order ${order.orderNumber} status=${order.status} tickets=${order._count.tickets} items=${order._count.items}`,
    );
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      // Soft refs without FK cascade
      await tx.$executeRawUnsafe(
        `DELETE FROM "email_deliveries" WHERE "order_id" = $1::uuid`,
        order.id,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM "tracking_events" WHERE "order_id" = $1::uuid`,
        order.id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "stripe_balance_transactions" SET "ticketfeeling_order_id" = NULL WHERE "ticketfeeling_order_id" = $1::uuid`,
        order.id,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM "background_jobs"
         WHERE "organization_id" = $1::uuid
           AND (
             ("payload"->>'orderId') = $2
             OR ("payload"->>'order_id') = $2
           )`,
        org.id,
        order.id,
      );

      // Free seats linked to this order's tickets (raw — avoids Prisma schema drift)
      await tx.$executeRawUnsafe(
        `UPDATE "event_seats" es
         SET "ticket_id" = NULL, "status" = 'available', "cart_item_id" = NULL
         FROM "tickets" t
         WHERE es.ticket_id = t.id AND t.order_id = $1::uuid`,
        order.id,
      );

      // Restore inventory sold counts from order items (best-effort)
      const items = await tx.$queryRawUnsafe<
        Array<{ category_id: string | null; quantity: number }>
      >(
        `SELECT category_id, quantity FROM "order_items" WHERE order_id = $1::uuid`,
        order.id,
      );
      for (const item of items) {
        if (!item.category_id) continue;
        await tx.$executeRawUnsafe(
          `UPDATE "inventory_pools"
           SET sold_quantity = GREATEST(0, sold_quantity - $1)
           WHERE category_id = $2::uuid`,
          item.quantity,
          item.category_id,
        );
      }

      await tx.$executeRawUnsafe(
        `DELETE FROM "inventory_holds" WHERE order_id = $1::uuid`,
        order.id,
      );

      // Cascade deletes tickets / payments / invoices via FK
      await tx.$executeRawUnsafe(`DELETE FROM "orders" WHERE id = $1::uuid`, order.id);
    });
  }

  // Orphan customers that only had deleted orders (optional cleanup)
  if (!dryRun && orders.length > 0) {
    const customerIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean))] as string[];
    for (const customerId of customerIds) {
      const remaining = await prisma.order.count({ where: { customerId } });
      if (remaining === 0) {
        await prisma.customer.delete({ where: { id: customerId } }).catch(() => {
          /* may have other FK refs — skip */
        });
      }
    }
  }

  // ——— 2) Delete non-kept events ———
  const doomedEvents = await prisma.event.findMany({
    where: {
      organizationId: org.id,
      id: { notIn: [...keepEventIds] },
    },
    select: { id: true, slug: true, name: true, status: true },
  });
  console.log(`[purge] events to delete: ${doomedEvents.length}`);
  for (const ev of doomedEvents) {
    console.log(`  ${dryRun ? "DRY " : ""}event ${ev.slug} (${ev.status})`);
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const categoryIds = (
        await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "event_ticket_categories" WHERE event_id = $1::uuid`,
          ev.id,
        )
      ).map((c) => c.id);
      if (categoryIds.length > 0) {
        await tx.$executeRawUnsafe(
          `DELETE FROM "cart_items" WHERE category_id = ANY($1::uuid[])`,
          categoryIds,
        );
      }
      const leftover = await tx.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*)::bigint AS c FROM "order_items" WHERE event_id = $1::uuid`,
        ev.id,
      );
      if (Number(leftover[0]?.c ?? 0) > 0) {
        throw new Error(`HAS_ORDERS:${ev.slug}`);
      }
      await tx.$executeRawUnsafe(`DELETE FROM "events" WHERE id = $1::uuid`, ev.id);
    });
  }

  // ——— 3) Clear Löwenberg schedule notice ———
  const loewenberg = await prisma.event.findFirst({
    where: { organizationId: org.id, slug: LOEWENBERG_SLUG },
    select: { id: true, slug: true, scheduleChangedAt: true },
  });
  if (loewenberg?.scheduleChangedAt) {
    console.log(
      `  ${dryRun ? "DRY " : ""}clear scheduleChangedAt on ${loewenberg.slug} (was ${loewenberg.scheduleChangedAt.toISOString()})`,
    );
    if (!dryRun) {
      await prisma.event.update({
        where: { id: loewenberg.id },
        data: { scheduleChangedAt: null },
      });
    }
  } else {
    console.log(`[purge] Löwenberg schedule notice already clear or event missing`);
  }

  // Drop empty tours (except kept)
  const emptyTours = await prisma.tour.findMany({
    where: {
      organizationId: org.id,
      ...(keepTour ? { id: { not: keepTour.id } } : {}),
      events: { none: {} },
    },
    select: { id: true, slug: true, name: true },
  });
  for (const tour of emptyTours) {
    console.log(`  ${dryRun ? "DRY " : ""}empty tour ${tour.slug}`);
    if (!dryRun) {
      await prisma.tour.delete({ where: { id: tour.id } });
    }
  }

  console.log(`[purge] done${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((err) => {
    console.error("[purge] failed", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
