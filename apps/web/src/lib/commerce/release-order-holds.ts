import { prisma } from "@/lib/db";

/** Release inventory holds for a failed/canceled unpaid order. */
export async function releaseOrderHolds(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, cartId: true, reservationStatus: true },
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

  if (holds.length === 0) {
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
    await tx.order.update({
      where: { id: orderId },
      data: { reservationStatus: "released" },
    });
  });

  return { released: holds.length };
}
