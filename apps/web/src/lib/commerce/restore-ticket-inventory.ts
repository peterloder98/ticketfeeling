import type { Prisma } from "@prisma/client";
import { lockCategoryInventoryPools } from "@/lib/commerce/inventory-availability";

export type RestoreInventoryChannel = "online" | "box_office";

/** Pick preferred channel pool, then fallback, then first locked row. */
export function pickRestoreInventoryPool<T extends { channel: string }>(
  pools: T[],
  preferred: RestoreInventoryChannel,
): T | undefined {
  const fallback: RestoreInventoryChannel =
    preferred === "online" ? "box_office" : "online";
  return (
    pools.find((p) => p.channel === preferred) ??
    pools.find((p) => p.channel === fallback) ??
    pools[0]
  );
}

/**
 * Cancel/void active tickets and restore inventory like box-office void:
 * lock pools, atomically decrement soldQuantity, free seats, optionally revoke QR.
 * Shared by Stripe full refund / dispute and Tageskasse void.
 */
export async function cancelTicketsAndRestoreInventory(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    /** When set, only these tickets; otherwise all active (or non-voided) on the order. */
    ticketIds?: string[];
    /** Ticket status after cancel — refunds use cancelled, box-office uses voided. */
    nextTicketStatus?: "cancelled" | "voided";
    /** Prefer this inventory channel when picking a pool to decrement. */
    preferredPoolChannel?: RestoreInventoryChannel;
    revokeQr?: boolean;
  },
): Promise<{ ticketIds: string[]; restoredQty: number }> {
  const nextStatus = input.nextTicketStatus ?? "cancelled";
  const tickets = await tx.ticket.findMany({
    where: {
      orderId: input.orderId,
      ...(input.ticketIds?.length
        ? { id: { in: input.ticketIds } }
        : nextStatus === "voided"
          ? { status: { not: "voided" } }
          : { status: "active" }),
    },
    select: {
      id: true,
      eventId: true,
      categoryId: true,
      status: true,
    },
  });

  const targets =
    nextStatus === "voided"
      ? tickets.filter((t) => t.status !== "voided")
      : tickets.filter((t) => t.status === "active");

  if (targets.length === 0) {
    return { ticketIds: [], restoredQty: 0 };
  }

  const voidIds = targets.map((t) => t.id);
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

  const preferred = input.preferredPoolChannel ?? "online";

  let restoredQty = 0;
  for (const { categoryId, qty } of qtyByKey.values()) {
    const pools = await lockCategoryInventoryPools(tx, categoryId);
    const pool = pickRestoreInventoryPool(pools, preferred);
    if (pool) {
      // Atomic decrement + floor at 0 (same race posture as hold release).
      await tx.$executeRaw`
        UPDATE inventory_pools
        SET
          sold_quantity = GREATEST(0, sold_quantity - ${qty}),
          version = version + 1
        WHERE id = ${pool.id}::uuid
      `;
      restoredQty += qty;
    }
  }

  await tx.ticket.updateMany({
    where: { id: { in: voidIds } },
    data: { status: nextStatus },
  });

  if (input.revokeQr !== false) {
    await tx.ticketQrToken.updateMany({
      where: { ticketId: { in: voidIds }, status: "active" },
      data: { status: "revoked", revokedAt: new Date() },
    });
  }

  await tx.eventSeat.updateMany({
    where: { ticketId: { in: voidIds } },
    data: {
      status: "available",
      ticketId: null,
      cartItemId: null,
      holdExpiresAt: null,
    },
  });

  return { ticketIds: voidIds, restoredQty };
}
