import { prisma } from "@/lib/db";
import { buildSellerIdentity, sellerSnapshotPayload } from "@/lib/legal/seller";
import { organizerSnapshotFromEvent } from "@/lib/legal/event-organizer";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { writeAudit } from "@/lib/audit";
import { signBoxOfficeSale } from "@/lib/fiscal/tse";
import { computeOrderPricing } from "@/lib/commerce/order-pricing";
import {
  claimBoxOfficeSeats,
  type BoxOfficeSeatingMode,
} from "@/lib/commerce/box-office-seating";
import { allocateOrderNumber } from "@/lib/commerce/order-number";
import type { Prisma } from "@prisma/client";

export type BoxOfficeSaleItem = {
  categoryId: string;
  quantity: number;
  /** Required for seat_map when category needs reserved seats */
  seatIds?: string[];
  accessibilitySelected?: boolean;
};

/**
 * Box-office cash/card sale.
 * TSE: see docs/tse-plan.md — signs/records via OrganizationSettings.tseMode.
 * Verwaltungsgebühr (platform fee) applies the same as online.
 */
export async function createBoxOfficeSale(input: {
  organizationId: string;
  eventId: string;
  items: BoxOfficeSaleItem[];
  paymentMethod: "cash" | "card_terminal" | "other" | "consignment";
  actorUserId: string;
  /**
   * Attribute sale to a partner (Kontingent). Defaults to actorUserId.
   * Admin may allocate for a Vorverkaufsstelle while remaining the actor.
   */
  soldByUserId?: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerStreet?: string;
  customerHouseNumber?: string;
  customerPostalCode?: string;
  customerCity?: string;
  /** Cash received in cents (optional, for change tracking) */
  cashTenderedCents?: number | null;
  /** best_available | seat_map — only when event has reserved seating */
  seatingMode?: BoxOfficeSeatingMode;
  /** Raise per-line cap (default 20; consignment uses up to 50). */
  maxQuantityPerItem?: number;
  /** Raise order total cap (default 40; consignment uses up to 50). */
  maxTotalQuantity?: number;
  /** Override contractSnapshot.notice (German). */
  contractNotice?: string;
  /** print | email | both — preferred ticket delivery after sale */
  preferredDelivery?: "print" | "email" | "both";
}) {
  const maxPerItem = input.maxQuantityPerItem ?? 20;
  const maxTotal = input.maxTotalQuantity ?? 40;
  const soldByUserId = input.soldByUserId ?? input.actorUserId;

  const items = input.items
    .map((i) => ({
      categoryId: i.categoryId,
      quantity: Math.max(0, Math.round(i.quantity)),
      seatIds: Array.isArray(i.seatIds)
        ? i.seatIds.filter((id): id is string => typeof id === "string")
        : undefined,
      accessibilitySelected: Boolean(i.accessibilitySelected),
    }))
    .filter((i) => i.quantity > 0);

  if (items.length === 0) throw new Error("INVALID_QUANTITY");
  if (items.some((i) => i.quantity > maxPerItem)) throw new Error("INVALID_QUANTITY");
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  if (totalQty > maxTotal) throw new Error("INVALID_QUANTITY");

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    include: { settings: true },
  });
  const seller = buildSellerIdentity(org, org.settings);

  const categories = await prisma.eventTicketCategory.findMany({
    where: {
      id: { in: items.map((i) => i.categoryId) },
      eventId: input.eventId,
      status: "active",
      boxOfficeBookable: true,
    },
    include: {
      event: { include: { location: true } },
      taxRate: true,
      pools: true,
    },
  });
  if (categories.length !== items.length) throw new Error("CATEGORY_UNAVAILABLE");
  const { isEventSalesReleased } = await import("@/lib/commerce/event-sale");
  const event = categories[0]!.event;
  for (const cat of categories) {
    if (cat.event.organizationId !== input.organizationId) throw new Error("ORG_MISMATCH");
    if (!isEventSalesReleased(cat.event.status) || cat.event.status === "sold_out") {
      throw new Error("SALE_CLOSED");
    }
  }

  const hasReservedSeating =
    Boolean(event.venuePlanId) &&
    (event.seatingBookingMode === "best_available" ||
      event.seatingBookingMode === "seat_map_and_best");

  let seatingMode: BoxOfficeSeatingMode = input.seatingMode ?? "free";
  if (hasReservedSeating) {
    if (seatingMode === "free") seatingMode = "best_available";
    // Tageskasse may offer Saalplan even when online is best_available-only.
    if (seatingMode !== "best_available" && seatingMode !== "seat_map") {
      seatingMode = "best_available";
    }
    const { ensureEventSeatsIfNeeded } = await import("@/lib/seating/materialize");
    await ensureEventSeatsIfNeeded(input.eventId);
  } else {
    seatingMode = "free";
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const { resolveTicketUnitPrice } = await import("@/lib/commerce/event-pricing");
  const campaigns = await loadEventPriceCampaigns(input.eventId);
  const accessibility = accessibilityOfferFromEvent(event);
  const now = new Date();

  const resolved = items.map((item) => {
    const category = byId.get(item.categoryId);
    if (!category) throw new Error("CATEGORY_UNAVAILABLE");
    const pool =
      category.pools.find((p) => p.channel === "box_office") ??
      category.pools.find((p) => p.channel === "online");
    if (!pool) throw new Error("NO_INVENTORY_POOL");
    const pricedUnit = resolveTicketUnitPrice({
      listCents: category.priceGrossCents,
      categoryId: category.id,
      channel: "box_office",
      now,
      campaigns,
      accessibility,
      accessibilitySelected: item.accessibilitySelected,
    });
    return { item, category, pool, pricedUnit };
  });

  const priced = computeOrderPricing({
    lines: resolved.map(({ item, category, pricedUnit }) => ({
      quantity: item.quantity,
      unitGrossCents: pricedUnit.unitCents,
      taxRateBps: category.taxRate.rateBps,
      feeEligible: true,
    })),
    platformFeeConfigRaw: org.settings?.platformFeeConfig,
  });

  const email =
    input.customerEmail?.toLowerCase().trim() ||
    `kasse+${Date.now()}@ticketfeeling.local`;
  const firstName = input.customerFirstName?.trim() || "Tageskasse";
  const lastName = input.customerLastName?.trim() || "Gast";
  const street = input.customerStreet?.trim() || "vor Ort";
  const houseNumber = input.customerHouseNumber?.trim() || "-";
  const postalCode = input.customerPostalCode?.trim() || seller.postalCode;
  const city = input.customerCity?.trim() || seller.city;

  const cashTenderedCents =
    input.paymentMethod === "cash" &&
    input.cashTenderedCents != null &&
    Number.isFinite(input.cashTenderedCents)
      ? Math.max(0, Math.round(input.cashTenderedCents))
      : null;
  const changeCents =
    cashTenderedCents != null
      ? Math.max(0, cashTenderedCents - priced.customerTotalCents)
      : null;

  const result = await prisma.$transaction(async (tx) => {
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
    for (const { item, pool, category } of resolved) {
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
      const available = channelAvailableQuantity(lockedPools, pool.channel, sellableCapacity);
      assertSufficientStock(available, item.quantity);
      await tx.inventoryPool.update({
        where: { id: pool.id },
        data: {
          soldQuantity: { increment: item.quantity },
          version: { increment: 1 },
        },
      });
    }

    const seatHoldExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const seatAssignments =
      hasReservedSeating && seatingMode !== "free"
        ? await claimBoxOfficeSeats(tx, {
            eventId: input.eventId,
            seatingBookingMode: event.seatingBookingMode,
            seatingMode,
            holdExpiresAt: seatHoldExpiresAt,
            seatOpt: event,
            items: resolved.map(({ item, category }) => ({
              categoryId: category.id,
              quantity: item.quantity,
              seatIds: item.seatIds,
              categoryKind: category.categoryKind,
              freeSeating: category.freeSeating,
              companionFree: category.companionFree,
            })),
          })
        : [];

    const customer = await tx.customer.upsert({
      where: {
        organizationId_emailNormalized: {
          organizationId: input.organizationId,
          emailNormalized: email,
        },
      },
      update: { firstName, lastName, street, houseNumber, postalCode, city },
      create: {
        organizationId: input.organizationId,
        email,
        emailNormalized: email,
        firstName,
        lastName,
        street,
        houseNumber,
        postalCode,
        city,
        country: "DE",
      },
    });

    const orderNumber = await allocateOrderNumber(
      tx,
      input.organizationId,
      "TF-K",
    );

    const sellerSnapshot = sellerSnapshotPayload(seller, "seller");
    const organizerSnapshot = organizerSnapshotFromEvent(org, org.settings, event);

    if (priced.lineSplits.length !== resolved.length) throw new Error("PRICE_MISMATCH");

    const order = await tx.order.create({
      data: {
        organizationId: input.organizationId,
        customerId: customer.id,
        orderNumber,
        // Cash/card at the counter is already settled — fulfillPaidOrder requires confirmed paid.
        status: "paid",
        paymentStatus: "paid",
        paidAt: new Date(),
        paymentCompletedAt: new Date(),
        channel: "box_office",
        currency: "EUR",
        paymentMethod: input.paymentMethod,
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
          firstName,
          lastName,
          street,
          houseNumber,
          postalCode,
          city,
          country: "DE",
        },
        sellerSnapshot,
        organizerSnapshot,
        contractSnapshot: {
          locale: "de-DE",
          channel: "box_office",
          notice:
            input.contractNotice ??
            (input.paymentMethod === "consignment"
              ? "Kontingent Vorverkaufsstelle (Vorabbuchung)."
              : "Tageskasse-Verkauf."),
          acceptedAt: new Date().toISOString(),
          paymentMethod: input.paymentMethod,
          consignment: input.paymentMethod === "consignment",
          partnerUserId: input.paymentMethod === "consignment" ? soldByUserId : undefined,
          cashTenderedCents,
          changeCents,
          ...(input.preferredDelivery
            ? { preferredDelivery: input.preferredDelivery }
            : {}),
          ...(seatAssignments.length > 0
            ? {
                seating: {
                  mode: seatingMode,
                  assignments: seatAssignments,
                },
              }
            : {}),
        },
        soldByUserId,
        deliveryStatus: "none",
        items: {
          create: resolved.map(({ item, category, pricedUnit }, index) => {
            const split = priced.lineSplits[index]!;
            return {
              eventId: category.eventId,
              categoryId: category.id,
              quantity: item.quantity,
              productNameSnapshot: `${category.name} Ticket`,
              eventNameSnapshot: category.event.name,
              eventStartsAtSnapshot: category.event.eventStartsAt,
              locationSnapshot: category.event.location
                ? `${category.event.location.name}, ${category.event.location.city ?? ""}`
                : null,
              categorySnapshot: category.name,
              unitListGrossCents: pricedUnit.listCents,
              unitPaidGrossCents:
                item.quantity > 0 ? Math.round(split.lineGrossCents / item.quantity) : 0,
              discountCents: split.discountShareCents,
              taxRateBps: category.taxRate.rateBps,
              netCents: split.lineNetCents,
              taxCents: split.lineTaxCents,
              grossCents: split.lineGrossCents,
            };
          }),
        },
      },
    });

    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        orderId: order.id,
        provider: "box_office",
        providerPaymentId: `box_${order.id}`,
        status: "paid",
        amountCents: priced.customerTotalCents,
        currency: "EUR",
        method: input.paymentMethod,
        rawStatus: JSON.stringify({
          paid: true,
          cashTenderedCents,
          changeCents,
        }),
        paidAt: new Date(),
      },
    });

    return { order, payment };
  });

  const fiscal = await signBoxOfficeSale({
    organizationId: input.organizationId,
    orderId: result.order.id,
    paymentId: result.payment.id,
    amountCents: result.payment.amountCents,
    currency: "EUR",
    paymentMethod:
      input.paymentMethod === "consignment" ? "other" : input.paymentMethod,
    tseMode: org.settings?.tseMode ?? "none",
    tseProvider: org.settings?.tseProvider,
    tseClientId: org.settings?.tseClientId,
    tseTssId: org.settings?.tseTssId,
  });

  await prisma.fiscalTransaction.create({
    data: {
      organizationId: input.organizationId,
      orderId: result.order.id,
      paymentId: result.payment.id,
      provider: fiscal.provider,
      status: fiscal.status,
      externalId: fiscal.externalId,
      tssId: fiscal.tssId,
      clientId: fiscal.clientId,
      processType: fiscal.processType,
      signatureValue: fiscal.signatureValue,
      signatureCounter: fiscal.signatureCounter,
      qrCodeData: fiscal.qrCodeData,
      certificateSerial: fiscal.certificateSerial,
      timeStart: fiscal.timeStart,
      timeEnd: fiscal.timeEnd,
      raw: (fiscal.raw ?? {}) as Prisma.InputJsonValue,
      errorMessage: fiscal.errorMessage,
    },
  });

  const fulfillment = await fulfillPaidOrder(result.order.id);

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.sale",
    entityType: "order",
    entityId: result.order.id,
    after: {
      paymentMethod: input.paymentMethod,
      items,
      seatingMode,
      feeGrossCents: priced.administrationFeeGrossCents,
      customerTotalCents: priced.customerTotalCents,
      cashTenderedCents,
      changeCents,
      tseMode: org.settings?.tseMode ?? "none",
      tseStatus: fiscal.status,
      soldByUserId,
    },
    reason:
      fiscal.status === "signed"
        ? "Tageskasse mit TSE-Signatur"
        : "Tageskasse — TSE siehe Stammdaten / docs/tse-plan.md",
  });

  return { orderId: result.order.id, orderNumber: result.order.orderNumber, fulfillment, fiscal };
}
