import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { computeOrderPricing } from "@/lib/commerce/order-pricing";
import { allocateOrderNumber } from "@/lib/commerce/order-number";
import { writeAudit } from "@/lib/audit";
import { buildSellerIdentity, sellerSnapshotPayload } from "@/lib/legal/seller";
import { organizerSnapshotFromEvent } from "@/lib/legal/event-organizer";
import {
  claimBoxOfficeSeats,
  type BoxOfficeSeatingMode,
} from "@/lib/commerce/box-office-seating";

export type DemoBuyer = {
  email: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
};

export async function createDemoPaidOrder(input: {
  organizationId: string;
  eventId: string;
  categoryId: string;
  quantity: number;
  buyer: DemoBuyer;
  /** Stable id for idempotent re-runs */
  demoKey: string;
}) {
  const quantity = Math.max(1, Math.min(3, Math.round(input.quantity)));
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    include: { settings: true },
  });
  const seller = buildSellerIdentity(org, org.settings);

  const category = await prisma.eventTicketCategory.findFirst({
    where: {
      id: input.categoryId,
      eventId: input.eventId,
      status: "active",
    },
    include: {
      event: { include: { location: true } },
      taxRate: true,
      pools: true,
    },
  });
  if (!category) throw new Error("CATEGORY_UNAVAILABLE");

  const pool =
    category.pools.find((p) => p.channel === "online") ??
    category.pools.find((p) => p.channel === "box_office");
  if (!pool) throw new Error("NO_INVENTORY_POOL");

  const event = category.event;
  const hasReservedSeating =
    Boolean(event.venuePlanId) &&
    (event.seatingBookingMode === "best_available" ||
      event.seatingBookingMode === "seat_map_and_best");

  let seatingMode: BoxOfficeSeatingMode = "free";
  if (hasReservedSeating) {
    seatingMode = "best_available";
    const { ensureEventSeatsIfNeeded } = await import("@/lib/seating/materialize");
    await ensureEventSeatsIfNeeded(input.eventId);
  }

  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const { resolveTicketUnitPrice } = await import("@/lib/commerce/event-pricing");
  const campaigns = await loadEventPriceCampaigns(input.eventId);
  const accessibility = accessibilityOfferFromEvent(event);
  const pricedUnit = resolveTicketUnitPrice({
    listCents: category.priceGrossCents,
    categoryId: category.id,
    channel: "online",
    now: new Date(),
    campaigns,
    accessibility,
    accessibilitySelected: false,
  });

  const priced = computeOrderPricing({
    lines: [
      {
        quantity,
        unitGrossCents: pricedUnit.unitCents,
        taxRateBps: category.taxRate.rateBps,
        feeEligible: true,
      },
    ],
    platformFeeConfigRaw: org.settings?.platformFeeConfig,
  });

  const email = input.buyer.email.toLowerCase().trim();
  const result = await prisma.$transaction(
    async (tx) => {
      const {
        assertSufficientStock,
        channelAvailableQuantity,
        lockCategoryInventoryPools,
      } = await import("@/lib/commerce/inventory-availability");
      const {
        assignedUnlockedSeatCounts,
        isPlanBackedTicketCategory,
        resolveSellableCategoryCapacity,
      } = await import("@/lib/seating/sync-category-capacity");

      const lockedPools = await lockCategoryInventoryPools(tx, category.id);
      const planBacked = isPlanBackedTicketCategory({
        freeSeating: category.freeSeating,
        categoryKind: category.categoryKind,
        seatingBookingMode: event.seatingBookingMode,
      });
      let assignedCount: number | null = null;
      if (planBacked) {
        const counts = await assignedUnlockedSeatCounts(tx, input.eventId, [category.id]);
        assignedCount = counts[category.id] ?? 0;
      }
      const sellableCapacity = resolveSellableCategoryCapacity({
        categoryCapacity: category.capacity,
        categoryKind: category.categoryKind,
        freeSeating: category.freeSeating,
        seatingBookingMode: event.seatingBookingMode,
        assignedUnlockedSeatCount: assignedCount,
      });
      const available = channelAvailableQuantity(
        lockedPools,
        pool.channel,
        sellableCapacity,
      );
      assertSufficientStock(available, quantity);

      let seatAssignments: { categoryId: string; seatIds: string[] }[] = [];
      if (hasReservedSeating && seatingMode !== "free") {
        seatAssignments = await claimBoxOfficeSeats(tx, {
          eventId: input.eventId,
          seatingBookingMode: event.seatingBookingMode,
          seatingMode,
          items: [
            {
              categoryId: category.id,
              quantity,
              categoryKind: category.categoryKind,
              freeSeating: category.freeSeating,
              companionFree: category.companionFree,
            },
          ],
          holdExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          seatOpt: {
            seatOptPreferContiguous: event.seatOptPreferContiguous,
            seatOptPreventNewSingletons: event.seatOptPreventNewSingletons,
            seatOptIntelligentRemnants: event.seatOptIntelligentRemnants,
            seatOptGapRelaxOccupancyPercent: event.seatOptGapRelaxOccupancyPercent,
          },
        });
      }

      await tx.inventoryPool.update({
        where: { id: pool.id },
        data: {
          soldQuantity: { increment: quantity },
          version: { increment: 1 },
        },
      });

      const customer = await tx.customer.upsert({
        where: {
          organizationId_emailNormalized: {
            organizationId: input.organizationId,
            emailNormalized: email,
          },
        },
        update: {
          firstName: input.buyer.firstName,
          lastName: input.buyer.lastName,
          street: input.buyer.street,
          houseNumber: input.buyer.houseNumber,
          postalCode: input.buyer.postalCode,
          city: input.buyer.city,
        },
        create: {
          organizationId: input.organizationId,
          email,
          emailNormalized: email,
          firstName: input.buyer.firstName,
          lastName: input.buyer.lastName,
          street: input.buyer.street,
          houseNumber: input.buyer.houseNumber,
          postalCode: input.buyer.postalCode,
          city: input.buyer.city,
          country: "DE",
        },
      });

      const orderNumber = await allocateOrderNumber(tx, input.organizationId, "TF-B");
      const sellerSnapshot = sellerSnapshotPayload(seller, "seller");
      const organizerSnapshot = organizerSnapshotFromEvent(org, org.settings, event);
      const split = priced.lineSplits[0]!;

      const order = await tx.order.create({
        data: {
          organizationId: input.organizationId,
          customerId: customer.id,
          orderNumber,
          status: "paid",
          paymentStatus: "paid",
          paidAt: new Date(),
          paymentCompletedAt: new Date(),
          channel: "online",
          currency: "EUR",
          paymentMethod: "card",
          paymentProvider: "dev",
          netCents: priced.netCents,
          taxCents: priced.taxCents,
          grossCents: priced.customerTotalCents,
          ticketsGrossCents: priced.ticketsGrossCents,
          ticketSubtotalCents: priced.ticketsGrossCents,
          customerTotalCents: priced.customerTotalCents,
          feeGrossCents: priced.administrationFeeGrossCents,
          feeNetCents: priced.administrationFeeNetCents,
          feeTaxCents: priced.administrationFeeTaxCents,
          feeSnapshot: priced.feeSnapshot as object,
          administrationFeePercentageBasisPoints: priced.administrationFeePercentageBasisPoints,
          administrationFeeGrossCents: priced.administrationFeeGrossCents,
          administrationFeeNetCents: priced.administrationFeeNetCents,
          administrationFeeTaxCents: priced.administrationFeeTaxCents,
          administrationFeeTaxAllocations: priced.administrationFeeTaxAllocations,
          calculationVersion: priced.calculationVersion,
          discountCents: priced.discountCents,
          billingSnapshot: {
            email,
            firstName: input.buyer.firstName,
            lastName: input.buyer.lastName,
            street: input.buyer.street,
            houseNumber: input.buyer.houseNumber,
            postalCode: input.buyer.postalCode,
            city: input.buyer.city,
            country: "DE",
          },
          sellerSnapshot,
          organizerSnapshot,
          contractSnapshot: {
            locale: "de-DE",
            channel: "online",
            demo: true,
            demoKey: input.demoKey,
            notice: "Demo-/Testbestellung (Seed) — keine echte Zahlung.",
            acceptedAt: new Date().toISOString(),
            paymentMethod: "card",
            ...(seatAssignments.length > 0
              ? {
                  seating: {
                    mode: seatingMode,
                    assignments: seatAssignments,
                  },
                }
              : {}),
          },
          deliveryStatus: "none",
          items: {
            create: [
              {
                eventId: category.eventId,
                categoryId: category.id,
                quantity,
                productNameSnapshot: `${category.name} Ticket`,
                eventNameSnapshot: category.event.name,
                eventStartsAtSnapshot: category.event.eventStartsAt,
                locationSnapshot: category.event.location
                  ? `${category.event.location.name}, ${category.event.location.city ?? ""}`
                  : null,
                categorySnapshot: category.name,
                unitListGrossCents: pricedUnit.listCents,
                unitPaidGrossCents:
                  quantity > 0 ? Math.round(split.lineGrossCents / quantity) : 0,
                discountCents: split.discountShareCents,
                taxRateBps: category.taxRate.rateBps,
                netCents: split.lineNetCents,
                taxCents: split.lineTaxCents,
                grossCents: split.lineGrossCents,
              },
            ],
          },
        },
      });

      const payment = await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          orderId: order.id,
          provider: "dev",
          providerPaymentId: `demo_${input.demoKey}`,
          status: "paid",
          amountCents: priced.customerTotalCents,
          currency: "EUR",
          method: "card",
          rawStatus: JSON.stringify({ paid: true, demo: true, demoKey: input.demoKey }),
          paidAt: new Date(),
        },
      });

      return { order, payment };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );

  const fulfillment = await fulfillPaidOrder(result.order.id);

  await writeAudit({
    organizationId: input.organizationId,
    action: "demo.order_seeded",
    entityType: "order",
    entityId: result.order.id,
    after: {
      demoKey: input.demoKey,
      eventId: input.eventId,
      categoryId: input.categoryId,
      quantity,
      tickets: fulfillment.alreadyFulfilled
        ? "existing"
        : fulfillment.issuedTokens.length,
    },
    reason: "Demo/test order seed — fake buyer, no Stripe charge",
  });

  return {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    fulfillment,
  };
}
