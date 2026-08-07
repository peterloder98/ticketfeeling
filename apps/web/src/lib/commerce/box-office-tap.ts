import { prisma } from "@/lib/db";
import { buildSellerIdentity, sellerSnapshotPayload } from "@/lib/legal/seller";
import { writeAudit } from "@/lib/audit";
import { computeOrderPricing } from "@/lib/commerce/order-pricing";
import {
  claimBoxOfficeSeats,
  type BoxOfficeSeatingMode,
} from "@/lib/commerce/box-office-seating";
import type { BoxOfficeSaleItem } from "@/lib/commerce/box-office";
import {
  createTerminalPaymentIntent,
  isStripeTerminalConfigured,
} from "@/lib/payments/stripe-terminal";
import { signBoxOfficeTapHandoff } from "@/lib/commerce/box-office-tap-token";
import { allocateOrderNumber } from "@/lib/commerce/order-number";
import { getPublicAppUrl } from "@/lib/embed/public-url";

const TAP_HOLD_MS = 20 * 60 * 1000;

/**
 * Pending Tageskasse Tap to Pay sale.
 * Inventory is held (not sold) until Stripe Terminal PaymentIntent succeeds → webhook → fulfillPaidOrder.
 * Cash / honor-card path stays on createBoxOfficeSale (immediate settle).
 */
export async function createBoxOfficeTapSale(input: {
  organizationId: string;
  eventId: string;
  items: BoxOfficeSaleItem[];
  actorUserId: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerStreet?: string;
  customerHouseNumber?: string;
  customerPostalCode?: string;
  customerCity?: string;
  seatingMode?: BoxOfficeSeatingMode;
}) {
  if (!isStripeTerminalConfigured()) throw new Error("STRIPE_TERMINAL_NOT_CONFIGURED");

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
  if (items.some((i) => i.quantity > 20)) throw new Error("INVALID_QUANTITY");
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  if (totalQty > 40) throw new Error("INVALID_QUANTITY");

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
      accessibilitySelected: Boolean(item.accessibilitySelected),
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

  const reservedUntil = new Date(Date.now() + TAP_HOLD_MS);

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
          heldQuantity: { increment: item.quantity },
          version: { increment: 1 },
        },
      });
    }

    const seatAssignments =
      hasReservedSeating && seatingMode !== "free"
        ? await claimBoxOfficeSeats(tx, {
            eventId: input.eventId,
            seatingBookingMode: event.seatingBookingMode,
            seatingMode,
            holdExpiresAt: reservedUntil,
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
    if (priced.lineSplits.length !== resolved.length) throw new Error("PRICE_MISMATCH");

    const order = await tx.order.create({
      data: {
        organizationId: input.organizationId,
        customerId: customer.id,
        orderNumber,
        status: "pending_payment",
        paymentStatus: "pending",
        paymentCreatedAt: new Date(),
        channel: "box_office",
        currency: "EUR",
        paymentMethod: "card_present",
        paymentProvider: "stripe",
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
        organizerSnapshot: { ...sellerSnapshot, role: "organizer" },
        contractSnapshot: {
          locale: "de-DE",
          channel: "box_office",
          notice: "Tageskasse Tap to Pay (Stripe Terminal).",
          acceptedAt: new Date().toISOString(),
          paymentMethod: "card_present",
          source: "box_office_tap",
          ...(seatAssignments.length > 0
            ? {
                seating: {
                  mode: seatingMode,
                  assignments: seatAssignments,
                },
              }
            : {}),
        },
        soldByUserId: input.actorUserId,
        deliveryStatus: "none",
        reservationStatus: "held",
        reservedUntil,
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

    for (const { item, pool } of resolved) {
      await tx.inventoryHold.create({
        data: {
          poolId: pool.id,
          orderId: order.id,
          quantity: item.quantity,
          status: "held",
          expiresAt: reservedUntil,
        },
      });
    }

    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        orderId: order.id,
        provider: "stripe",
        status: "pending",
        amountCents: priced.customerTotalCents,
        currency: "EUR",
        method: "card_present",
        rawStatus: JSON.stringify({ source: "box_office_tap", pending: true }),
      },
    });

    return { order, payment, customerEmail: email };
  });

  let intent;
  try {
    intent = await createTerminalPaymentIntent({
      orderId: result.order.id,
      organizationId: input.organizationId,
      soldByUserId: input.actorUserId,
      amountCents: priced.customerTotalCents,
      currency: "EUR",
      orderNumber: result.order.orderNumber,
      eventId: input.eventId,
      customerEmail: result.customerEmail.includes("@ticketfeeling.local")
        ? null
        : result.customerEmail,
    });
  } catch (error) {
    // Roll back hold if Stripe PI creation fails
    const { releaseOrderHolds } = await import("@/lib/commerce/release-order-holds");
    await prisma.order.update({
      where: { id: result.order.id },
      data: {
        paymentStatus: "failed",
        status: "cancelled",
        failedReasonMessage: error instanceof Error ? error.message : "STRIPE_PI_FAILED",
      },
    });
    await prisma.payment.updateMany({
      where: { orderId: result.order.id, provider: "stripe" },
      data: { status: "failed" },
    });
    await releaseOrderHolds(result.order.id);
    throw error instanceof Error ? error : new Error("STRIPE_PI_FAILED");
  }

  if (!intent.clientSecret) {
    throw new Error("STRIPE_CLIENT_SECRET_MISSING");
  }

  await prisma.order.update({
    where: { id: result.order.id },
    data: {
      stripePaymentIntentId: intent.paymentIntentId,
      providerTransactionId: intent.paymentIntentId,
      paymentStatus: "awaiting_payment_method",
    },
  });
  await prisma.payment.update({
    where: { id: result.payment.id },
    data: {
      providerPaymentId: intent.paymentIntentId,
      rawStatus: intent.status,
    },
  });

  const handoffToken = signBoxOfficeTapHandoff(result.order.id);
  if (!handoffToken) {
    throw new Error("TAP_HANDOFF_SECRET_MISSING");
  }
  const apiBase = getPublicAppUrl();
  // Do not put clientSecret in the deep-link URL (logs, history, Referer).
  // iOS fetches it via POST /api/v1/box-office/terminal/payment-intent with handoff.
  const deepLinkParams = new URLSearchParams({
    orderId: result.order.id,
    paymentIntentId: intent.paymentIntentId,
    handoff: handoffToken,
    apiBase,
  });
  const deepLink = `ticketfeeling-kasse://pay?${deepLinkParams.toString()}`;

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.tap_sale_created",
    entityType: "order",
    entityId: result.order.id,
    after: {
      paymentMethod: "card_present",
      source: "box_office_tap",
      items,
      seatingMode,
      customerTotalCents: priced.customerTotalCents,
      paymentIntentId: intent.paymentIntentId,
      soldByUserId: input.actorUserId,
    },
    reason: "Tageskasse Tap to Pay — warte auf Stripe Terminal",
  });

  return {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    amountCents: priced.customerTotalCents,
    paymentIntentId: intent.paymentIntentId,
    clientSecret: intent.clientSecret,
    locationId: intent.locationId,
    handoffToken,
    deepLink,
    detailPath: `/kasse/beleg/${result.order.id}`,
    statusPath: `/api/v1/box-office/sales/${result.order.id}`,
    reservedUntil: reservedUntil.toISOString(),
  };
}
