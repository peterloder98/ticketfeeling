import type { Prisma } from "@prisma/client";
import { releaseHeldQuantity } from "@/lib/commerce/hold-quantity";
import { logSeatConflict } from "@/lib/seating/seat-conflict-log";

type Tx = Prisma.TransactionClient;

/**
 * Free expired holds among `seatIds` inside the claim transaction so the
 * subsequent conditional update can take them. Sold seats are never touched.
 * Inventory holds for other carts are released when their seats are reclaimed.
 */
export async function reclaimExpiredSeatsForClaim(
  tx: Tx,
  seatIds: string[],
  now: Date,
  meta?: { eventId?: string; channel?: string },
): Promise<number> {
  if (seatIds.length === 0) return 0;

  const expired = await tx.eventSeat.findMany({
    where: {
      id: { in: seatIds },
      status: "held",
      holdExpiresAt: { lt: now },
    },
    select: { id: true, cartItemId: true, eventId: true, status: true },
  });
  if (expired.length === 0) return 0;

  const byCartItem = new Map<string | null, string[]>();
  for (const seat of expired) {
    const list = byCartItem.get(seat.cartItemId) ?? [];
    list.push(seat.id);
    byCartItem.set(seat.cartItemId, list);
  }

  let freed = 0;

  const orphanIds = byCartItem.get(null) ?? [];
  if (orphanIds.length > 0) {
    const updated = await tx.eventSeat.updateMany({
      where: { id: { in: orphanIds }, status: "held", holdExpiresAt: { lt: now } },
      data: { status: "available", holdExpiresAt: null, cartItemId: null },
    });
    freed += updated.count;
  }

  const cartItemIds = [...byCartItem.keys()].filter((id): id is string => Boolean(id));
  if (cartItemIds.length > 0) {
    const holds = await tx.inventoryHold.findMany({
      where: { cartItemId: { in: cartItemIds }, status: "held" },
      select: {
        id: true,
        poolId: true,
        quantity: true,
        cartItemId: true,
        orderId: true,
        cartItem: {
          select: {
            cart: {
              select: {
                status: true,
                orders: {
                  select: { paymentStatus: true },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    const holdByCartItem = new Map(
      holds.filter((h) => h.cartItemId).map((h) => [h.cartItemId as string, h]),
    );

    for (const cartItemId of cartItemIds) {
      const hold = holdByCartItem.get(cartItemId);
      const paymentStatus = hold?.cartItem?.cart?.orders?.[0]?.paymentStatus;
      // Never steal seats from carts mid-payment (same protection as expireSeatHolds).
      if (
        hold &&
        (hold.orderId ||
          (hold.cartItem?.cart?.status === "converted" &&
            (paymentStatus === "pending" || paymentStatus === "processing")))
      ) {
        continue;
      }
      if (hold) {
        await releaseHeldQuantity(tx, hold, "expired");
      }
      const updated = await tx.eventSeat.updateMany({
        where: { cartItemId, status: "held" },
        data: { status: "available", holdExpiresAt: null, cartItemId: null },
      });
      freed += updated.count;
    }
  }

  if (freed > 0) {
    logSeatConflict({
      type: "expired_hold_reclaim",
      eventId: meta?.eventId ?? expired[0]?.eventId,
      seatIds: expired.map((s) => s.id),
      channel: meta?.channel,
      detail: { freed },
    });
  }

  return freed;
}

/**
 * Atomic seat claim: only available + unlocked (+ optional category) seats.
 * Call reclaimExpiredSeatsForClaim first when soft-expired holds should be claimable.
 * Returns claimed count — caller must assert equality with seatIds.length.
 */
export async function claimSeatsAtomically(
  tx: Tx,
  input: {
    seatIds: string[];
    cartItemId: string | null;
    holdExpiresAt: Date;
    categoryId?: string | null;
    eventId?: string;
    channel?: string;
  },
): Promise<{ claimed: number }> {
  if (input.seatIds.length === 0) return { claimed: 0 };

  const claimed = await tx.eventSeat.updateMany({
    where: {
      id: { in: input.seatIds },
      status: "available",
      locked: false,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
    },
    data: {
      status: "held",
      holdExpiresAt: input.holdExpiresAt,
      cartItemId: input.cartItemId,
    },
  });

  if (claimed.count !== input.seatIds.length) {
    // Diagnose which seats failed for structured conflict logs (minimal PII).
    const rows = await tx.eventSeat.findMany({
      where: { id: { in: input.seatIds } },
      select: {
        id: true,
        status: true,
        locked: true,
        categoryId: true,
        cartItemId: true,
        holdExpiresAt: true,
        eventId: true,
      },
    });
    logSeatConflict({
      type: "claim_conflict",
      eventId: input.eventId ?? rows[0]?.eventId,
      seatIds: input.seatIds,
      channel: input.channel,
      cartItemId: input.cartItemId,
      detail: {
        expected: input.seatIds.length,
        claimed: claimed.count,
        seats: rows.map((r) => ({
          seatId: r.id,
          status: r.status,
          locked: r.locked,
          categoryId: r.categoryId,
          cartItemId: r.cartItemId,
          holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
        })),
      },
    });
  }

  return { claimed: claimed.count };
}

/**
 * Mark seats sold only from held — never overwrite sold from another path.
 * Returns how many were transitioned; mismatch means conflict / already sold.
 */
export async function markSeatsSoldFromHeld(
  tx: Tx,
  seats: { seatId: string; ticketId: string }[],
  meta?: { eventId?: string; orderId?: string },
): Promise<{ sold: number }> {
  let sold = 0;
  for (const { seatId, ticketId } of seats) {
    const updated = await tx.eventSeat.updateMany({
      where: { id: seatId, status: "held" },
      data: {
        status: "sold",
        ticketId,
        holdExpiresAt: null,
        cartItemId: null,
      },
    });
    if (updated.count === 1) {
      sold += 1;
      continue;
    }
    const row = await tx.eventSeat.findUnique({
      where: { id: seatId },
      select: { id: true, status: true, ticketId: true, eventId: true },
    });
    // Idempotent: already sold to this ticket is OK.
    if (row?.status === "sold" && row.ticketId === ticketId) {
      sold += 1;
      continue;
    }
    logSeatConflict({
      type: "sold_transition_conflict",
      eventId: meta?.eventId ?? row?.eventId,
      seatIds: [seatId],
      orderId: meta?.orderId,
      detail: {
        expected: "held→sold",
        actualStatus: row?.status ?? "missing",
        ticketId: row?.ticketId,
      },
    });
  }
  return { sold };
}
