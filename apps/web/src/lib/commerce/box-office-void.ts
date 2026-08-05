import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { canVoidBoxOfficeOrder } from "@/lib/commerce/box-office-access";
import { invalidateWalletPassesForTickets } from "@/lib/wallet/invalidate";

type VoidResult = {
  ok: true;
  voidedTicketIds: string[];
  orderCancelled: boolean;
};

/**
 * Storniert einen Tageskasse-Verkauf ganz oder teilweise:
 * Tickets voided, QR revoked, Sitzplätze frei, Kontingent zurück.
 * Ohne ticketIds: gesamter Vorgang (wie bisher).
 */
export async function voidBoxOfficeOrder(input: {
  orderId: string;
  organizationId: string;
  actorUserId: string;
  reason?: string;
  /** If set, only these tickets; omit to void the whole order. */
  ticketIds?: string[];
}): Promise<VoidResult> {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
      channel: "box_office",
    },
    include: {
      tickets: {
        include: {
          eventSeat: true,
        },
      },
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

  const requestedIds = input.ticketIds?.length
    ? new Set(input.ticketIds)
    : null;

  if (requestedIds) {
    for (const id of requestedIds) {
      if (!order.tickets.some((t) => t.id === id)) {
        throw new Error("TICKET_NOT_ON_ORDER");
      }
    }
  }

  const targets = order.tickets.filter((t) =>
    requestedIds ? requestedIds.has(t.id) : true,
  );
  if (targets.length === 0) throw new Error("NO_TICKETS");

  for (const ticket of targets) {
    if (ticket.status === "voided") throw new Error("TICKET_ALREADY_VOIDED");
    if (ticket.presence === "in") throw new Error("CHECKED_IN");
  }

  const voidIds = targets.map((t) => t.id);
  const remainingActive = order.tickets.filter(
    (t) => t.status !== "voided" && !voidIds.includes(t.id),
  );
  const cancelOrder = remainingActive.length === 0;

  // Decrement inventory by category for voided tickets (not full item qty when partial).
  const qtyByKey = new Map<string, { eventId: string; categoryId: string; qty: number }>();
  for (const ticket of targets) {
    if (!ticket.categoryId) continue;
    const key = `${ticket.eventId}:${ticket.categoryId}`;
    const prev = qtyByKey.get(key);
    if (prev) prev.qty += 1;
    else {
      qtyByKey.set(key, {
        eventId: ticket.eventId,
        categoryId: ticket.categoryId,
        qty: 1,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const { eventId, categoryId, qty } of qtyByKey.values()) {
      const pools = await tx.inventoryPool.findMany({
        where: { eventId, categoryId },
      });
      const pool =
        pools.find((p) => p.channel === "box_office") ??
        pools.find((p) => p.channel === "online");
      if (pool) {
        await tx.inventoryPool.update({
          where: { id: pool.id },
          data: {
            soldQuantity: Math.max(0, pool.soldQuantity - qty),
            version: { increment: 1 },
          },
        });
      }
    }

    await tx.ticket.updateMany({
      where: { id: { in: voidIds } },
      data: { status: "voided" },
    });

    await tx.ticketQrToken.updateMany({
      where: { ticketId: { in: voidIds }, status: "active" },
      data: { status: "revoked", revokedAt: new Date() },
    });

    // Free linked seats so they can be sold again.
    await tx.eventSeat.updateMany({
      where: { ticketId: { in: voidIds } },
      data: {
        status: "available",
        ticketId: null,
        cartItemId: null,
        holdExpiresAt: null,
      },
    });

    if (cancelOrder) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          voidedAt: new Date(),
          voidedByUserId: input.actorUserId,
          voidReason: input.reason?.trim() || "Tageskasse storniert",
        },
      });
    }
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: cancelOrder ? "box_office.void" : "box_office.void_partial",
    entityType: "order",
    entityId: order.id,
    after: {
      reason: input.reason ?? null,
      deliveryStatus: order.deliveryStatus,
      ticketIds: voidIds,
      ticketCount: voidIds.length,
      orderCancelled: cancelOrder,
      remainingActive: remainingActive.length,
    },
  });

  // QR already revoked in the transaction — skip double revoke, still void wallet passes.
  await invalidateWalletPassesForTickets(voidIds, { revokeQr: false }).catch((error) => {
    console.error("[wallet] invalidate after box-office void failed", order.id, error);
  });

  return {
    ok: true as const,
    voidedTicketIds: voidIds,
    orderCancelled: cancelOrder,
  };
}
