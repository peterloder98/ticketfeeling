import { prisma } from "@/lib/db";
import { readBoxOfficeSeatAssignments } from "@/lib/commerce/box-office-seating";

/** Release inventory holds for a failed/canceled unpaid order. */
export async function releaseOrderHolds(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      cartId: true,
      reservationStatus: true,
      channel: true,
      contractSnapshot: true,
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
    await prisma.order.update({
      where: { id: orderId },
      data: { reservationStatus: "released" },
    });
    return { released: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const hold of holds) {
      const current = await tx.inventoryHold.findUnique({
        where: { id: hold.id },
        select: { id: true, status: true, cartItemId: true, quantity: true, poolId: true },
      });
      if (!current || current.status !== "held") continue;
      await tx.inventoryHold.update({
        where: { id: current.id },
        data: { status: "released" },
      });
      await tx.inventoryPool.update({
        where: { id: current.poolId },
        data: { heldQuantity: { decrement: current.quantity } },
      });
      if (current.cartItemId) {
        await tx.eventSeat.updateMany({
          where: { cartItemId: current.cartItemId, status: "held" },
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
  });

  return { released: holds.length };
}
