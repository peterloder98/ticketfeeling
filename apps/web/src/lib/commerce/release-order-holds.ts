import { prisma } from "@/lib/db";
import { readBoxOfficeSeatAssignments } from "@/lib/commerce/box-office-seating";
import { releaseHeldQuantity } from "@/lib/commerce/hold-quantity";
import { releaseOrderPromotions } from "@/lib/commerce/discounts";

/** Release inventory holds for a failed/canceled unpaid order. */
export async function releaseOrderHolds(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      organizationId: true,
      cartId: true,
      reservationStatus: true,
      channel: true,
      contractSnapshot: true,
      discountCode: true,
      giftCardCode: true,
      giftCardAppliedCents: true,
      promotionsReservedAt: true,
    },
  });
  if (!order) return { released: 0 };

  const holds = await prisma.inventoryHold.findMany({
    where: {
      status: "held",
      OR: [
        { orderId },
        ...(order.cartId
          ? [{ cartItem: { cartId: order.cartId } }]
          : []),
      ],
    },
  });

  const boxOfficeSeatIds =
    order.channel === "box_office"
      ? readBoxOfficeSeatAssignments(order.contractSnapshot).flatMap((a) => a.seatIds)
      : [];

  if (holds.length === 0 && boxOfficeSeatIds.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { reservationStatus: "released" },
      });
      await releaseOrderPromotions(tx, {
        id: order.id,
        organizationId: order.organizationId,
        discountCode: order.discountCode,
        giftCardCode: order.giftCardCode,
        giftCardAppliedCents: order.giftCardAppliedCents,
        promotionsReservedAt: order.promotionsReservedAt,
      });
    });
    return { released: 0 };
  }

  let released = 0;
  await prisma.$transaction(async (tx) => {
    for (const hold of holds) {
      const applied = await releaseHeldQuantity(tx, hold, "released");
      if (!applied) continue;
      released += 1;
      if (hold.cartItemId) {
        await tx.eventSeat.updateMany({
          where: { cartItemId: hold.cartItemId, status: "held" },
          data: { status: "available", holdExpiresAt: null, cartItemId: null },
        });
      }
    }
    // Tageskasse Tap to Pay seats are held without cartItemId (see claimBoxOfficeSeats).
    if (boxOfficeSeatIds.length > 0) {
      await tx.eventSeat.updateMany({
        where: { id: { in: boxOfficeSeatIds }, status: "held" },
        data: { status: "available", holdExpiresAt: null, cartItemId: null },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { reservationStatus: "released" },
    });
    await releaseOrderPromotions(tx, {
      id: order.id,
      organizationId: order.organizationId,
      discountCode: order.discountCode,
      giftCardCode: order.giftCardCode,
      giftCardAppliedCents: order.giftCardAppliedCents,
      promotionsReservedAt: order.promotionsReservedAt,
    });
  });

  return { released };
}
