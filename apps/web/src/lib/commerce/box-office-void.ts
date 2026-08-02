import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { canVoidBoxOfficeOrder } from "@/lib/commerce/box-office-access";

/**
 * Storniert einen Tageskasse-Verkauf: Tickets voided, QR revoked, Kontingent zurück.
 */
export async function voidBoxOfficeOrder(input: {
  orderId: string;
  organizationId: string;
  actorUserId: string;
  reason?: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
      channel: "box_office",
    },
    include: {
      tickets: true,
      items: true,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.voidedAt) throw new Error("ALREADY_VOIDED");

  const allowed = await canVoidBoxOfficeOrder({
    userId: input.actorUserId,
    organizationId: input.organizationId,
    order,
  });
  if (!allowed) {
    if (order.deliveryStatus !== "none") throw new Error("DELIVERED_NEEDS_ADMIN");
    throw new Error("FORBIDDEN");
  }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      if (!item.categoryId) continue;
      const pools = await tx.inventoryPool.findMany({
        where: { eventId: item.eventId, categoryId: item.categoryId },
      });
      const pool =
        pools.find((p) => p.channel === "box_office") ??
        pools.find((p) => p.channel === "online");
      if (pool) {
        await tx.inventoryPool.update({
          where: { id: pool.id },
          data: {
            soldQuantity: Math.max(0, pool.soldQuantity - item.quantity),
            version: { increment: 1 },
          },
        });
      }
    }

    await tx.ticket.updateMany({
      where: { orderId: order.id },
      data: { status: "voided" },
    });

    const ticketIds = order.tickets.map((t) => t.id);
    if (ticketIds.length > 0) {
      await tx.ticketQrToken.updateMany({
        where: { ticketId: { in: ticketIds }, status: "active" },
        data: { status: "revoked", revokedAt: new Date() },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "cancelled",
        voidedAt: new Date(),
        voidedByUserId: input.actorUserId,
        voidReason: input.reason?.trim() || "Tageskasse storniert",
      },
    });
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.void",
    entityType: "order",
    entityId: order.id,
    after: {
      reason: input.reason ?? null,
      deliveryStatus: order.deliveryStatus,
      ticketCount: order.tickets.length,
    },
  });

  return { ok: true as const };
}
