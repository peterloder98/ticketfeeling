import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { releaseHeldQuantity } from "@/lib/commerce/hold-quantity";
import { isSeatHeldByOwner } from "@/lib/seating/is-seat-bookable";
import { logSeatConflict } from "@/lib/seating/seat-conflict-log";
import { categoryNeedsSeats, seatsPerTicket } from "@/lib/seating/types";

type Tx = Prisma.TransactionClient;

export type CartScrubResult = {
  changed: boolean;
  removedSeatIds: string[];
  removedItemIds: string[];
  adjustedItemIds: string[];
  /** German hint for UI — empty when nothing changed. */
  hint: string | null;
};

/**
 * Self-heal an open cart: drop seats no longer held by this cart (sold, stolen,
 * expired, locked) and shrink/remove line items so inventory matches reality.
 * Never frees sold seats. Optimization is not re-run here — remaining holds stay.
 */
export async function scrubCartSeatHolds(
  cartId: string,
  opts?: { now?: Date },
): Promise<CartScrubResult> {
  const now = opts?.now ?? new Date();
  const empty: CartScrubResult = {
    changed: false,
    removedSeatIds: [],
    removedItemIds: [],
    adjustedItemIds: [],
    hint: null,
  };

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    select: {
      id: true,
      status: true,
      items: {
        include: {
          hold: true,
          seats: {
            select: {
              id: true,
              status: true,
              locked: true,
              cartItemId: true,
              holdExpiresAt: true,
              categoryId: true,
            },
          },
          category: {
            select: {
              categoryKind: true,
              freeSeating: true,
              companionFree: true,
              event: { select: { seatingBookingMode: true } },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.status !== "open" || cart.items.length === 0) return empty;

  const removedSeatIds: string[] = [];
  const removedItemIds: string[] = [];
  const adjustedItemIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of cart.items) {
      const needsSeats = categoryNeedsSeats({
        seatingBookingMode: item.category.event.seatingBookingMode,
        categoryKind: item.category.categoryKind,
        freeSeating: item.category.freeSeating,
      });
      if (!needsSeats) continue;

      const perTicket = seatsPerTicket({
        categoryKind: item.category.categoryKind,
        companionFree: item.category.companionFree,
      });
      const validSeats = item.seats.filter((s) => isSeatHeldByOwner(s, item.id, now));
      const invalidSeats = item.seats.filter((s) => !isSeatHeldByOwner(s, item.id, now));

      for (const bad of invalidSeats) {
        removedSeatIds.push(bad.id);
        // Detach only if still linked to this item and not sold (sold absolute priority).
        if (bad.status !== "sold") {
          await tx.eventSeat.updateMany({
            where: {
              id: bad.id,
              cartItemId: item.id,
              status: { not: "sold" },
            },
            data: { status: "available", holdExpiresAt: null, cartItemId: null },
          });
        } else if (bad.cartItemId === item.id) {
          // Sold but still pointing at cart — clear link only.
          await tx.eventSeat.updateMany({
            where: { id: bad.id, cartItemId: item.id, status: "sold" },
            data: { cartItemId: null, holdExpiresAt: null },
          });
          logSeatConflict({
            type: "impossible_state",
            cartId,
            cartItemId: item.id,
            seatIds: [bad.id],
            detail: { reason: "sold_seat_still_linked_to_cart" },
          });
        }
      }

      const validCount = validSeats.length;
      const maxQty = Math.floor(validCount / Math.max(1, perTicket));

      if (maxQty >= item.quantity && invalidSeats.length === 0) {
        continue;
      }

      if (maxQty < 1) {
        // Entire line gone — release inventory hold and delete item.
        if (item.hold?.status === "held") {
          await releaseHeldQuantity(tx, item.hold, "released");
        }
        await tx.eventSeat.updateMany({
          where: { cartItemId: item.id, status: "held" },
          data: { status: "available", holdExpiresAt: null, cartItemId: null },
        });
        await tx.cartItem.delete({ where: { id: item.id } });
        removedItemIds.push(item.id);
        continue;
      }

      const dropQty = item.quantity - maxQty;
      if (dropQty > 0 || invalidSeats.length > 0) {
        await shrinkCartItemSeats(tx, {
          itemId: item.id,
          holdId: item.hold?.status === "held" ? item.hold.id : null,
          holdPoolId: item.hold?.poolId ?? null,
          holdQuantity: item.hold?.quantity ?? item.quantity,
          newQuantity: maxQty,
          keepSeatIds: validSeats.slice(0, maxQty * perTicket).map((s) => s.id),
        });
        adjustedItemIds.push(item.id);
      }
    }
  });

  const changed =
    removedSeatIds.length > 0 || removedItemIds.length > 0 || adjustedItemIds.length > 0;

  if (!changed) return empty;

  logSeatConflict({
    type: "cart_scrub",
    cartId,
    seatIds: removedSeatIds,
    detail: {
      removedItemIds,
      adjustedItemIds,
      removedSeatCount: removedSeatIds.length,
    },
  });

  const n = removedSeatIds.length;
  const hint =
    n <= 1
      ? "Ein ausgewählter Platz ist leider gerade nicht mehr verfügbar. Wir haben deine Auswahl aktualisiert."
      : `${n} ausgewählte Plätze sind leider gerade nicht mehr verfügbar. Wir haben deine Auswahl aktualisiert.`;

  return {
    changed: true,
    removedSeatIds,
    removedItemIds,
    adjustedItemIds,
    hint,
  };
}

async function shrinkCartItemSeats(
  tx: Tx,
  input: {
    itemId: string;
    holdId: string | null;
    holdPoolId: string | null;
    holdQuantity: number;
    newQuantity: number;
    keepSeatIds: string[];
  },
) {
  // Free seats that are still held by this item but no longer kept.
  await tx.eventSeat.updateMany({
    where: {
      cartItemId: input.itemId,
      status: "held",
      ...(input.keepSeatIds.length > 0
        ? { id: { notIn: input.keepSeatIds } }
        : {}),
    },
    data: { status: "available", holdExpiresAt: null, cartItemId: null },
  });

  await tx.cartItem.update({
    where: { id: input.itemId },
    data: { quantity: input.newQuantity },
  });

  if (input.holdId && input.holdPoolId) {
    const delta = input.holdQuantity - input.newQuantity;
    if (delta > 0) {
      await tx.inventoryHold.update({
        where: { id: input.holdId },
        data: { quantity: input.newQuantity },
      });
      await tx.inventoryPool.update({
        where: { id: input.holdPoolId },
        data: { heldQuantity: { decrement: delta } },
      });
      await tx.$executeRaw`
        UPDATE inventory_pools
        SET held_quantity = 0
        WHERE id = ${input.holdPoolId}::uuid AND held_quantity < 0
      `;
    }
  }
}

/** Scrub then reload — used by warenkorb / checkout entry. */
export async function scrubAndHint(cartId: string): Promise<{ hint: string | null }> {
  const result = await scrubCartSeatHolds(cartId);
  return { hint: result.hint };
}
