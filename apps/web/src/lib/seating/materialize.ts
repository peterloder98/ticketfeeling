import { prisma } from "@/lib/db";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";
import {
  mapSlotKeysToCategoryIds,
  parsePlanCategorySlots,
  resolveSeatCategoryKey,
} from "@/lib/saalplan/category-slots";
import { parseSeatingLayoutConfig } from "@/lib/seating/layout-config";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { syncPlanBackedCategoryCapacities } from "@/lib/seating/sync-category-capacity";

type DesiredSeat = {
  eventId: string;
  venuePlanId: string;
  blockObjectId: string;
  blockLabel: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatNumber: string;
  seatKey: string;
  status: string;
};

function buildDesiredSeats(
  eventId: string,
  venuePlanId: string,
  objects: ReturnType<typeof parseVenuePlanObjects>,
): DesiredSeat[] {
  const rows: DesiredSeat[] = [];
  for (const block of objects) {
    if (block.type !== "seat_block") continue;
    // Free-choice / unnumbered blocks are geometry only — no EventSeat inventory.
    if (block.numberedSeats === false) continue;
    const rowCount = Math.max(0, Math.round(block.rows ?? 0));
    const colCount = Math.max(0, Math.round(block.seatsPerRow ?? 0));
    const blockLabel = (block.label ?? "Block").trim() || "Block";
    for (let r = 1; r <= rowCount; r += 1) {
      for (let s = 1; s <= colCount; s += 1) {
        rows.push({
          eventId,
          venuePlanId,
          blockObjectId: block.id,
          blockLabel,
          rowIndex: r,
          seatIndex: s,
          rowLabel: String(r),
          seatNumber: String(s),
          seatKey: `${block.id}:R${r}:S${s}`,
          status: "available",
        });
      }
    }
  }
  return rows;
}

function categoryIdFromPlan(
  block: ReturnType<typeof parseVenuePlanObjects>[number] | undefined,
  rowIndex: number,
  seatIndex: number,
  slotToCategoryId: Map<string, string>,
): string | null | undefined {
  if (!block) return undefined;
  const key = resolveSeatCategoryKey(block, rowIndex, seatIndex);
  if (!key) return undefined;
  return slotToCategoryId.get(key) ?? null;
}

/**
 * Expand / sync venue plan seat_blocks into EventSeat rows.
 * - Adds missing seats (unassigned by default; legacy plan slots can prefill categoryId)
 * - Updates labels for existing keys
 * - Does not wipe event-assigned categoryId on available seats when saving plan geometry
 * - Slot name-match is legacy fallback only (old painted plans)
 * - Removes only `available` seats that no longer exist in the plan
 * - Never deletes held/sold seats
 */
export async function ensureEventSeats(eventId: string) {
  await ensureSeatingAssignmentSchema(prisma);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venuePlan: true,
      ticketCategories: {
        where: { status: "active" },
        select: { id: true, name: true },
      },
    },
  });
  if (!event?.venuePlanId || !event.venuePlan) return { created: 0, updated: 0, removed: 0, total: 0 };
  if (event.seatingBookingMode === "none") return { created: 0, updated: 0, removed: 0, total: 0 };

  // Plan switch: drop non-sold inventory from the previous plan
  const foreign = await prisma.eventSeat.findFirst({
    where: { eventId, venuePlanId: { not: event.venuePlanId }, status: { not: "sold" } },
    select: { id: true },
  });
  if (foreign) {
    await prisma.eventSeat.updateMany({
      where: { eventId, venuePlanId: { not: event.venuePlanId }, status: "held" },
      data: { status: "available", holdExpiresAt: null, cartItemId: null },
    });
    await prisma.eventSeat.deleteMany({
      where: {
        eventId,
        venuePlanId: { not: event.venuePlanId },
        status: { in: ["available", "held"] },
      },
    });
  }

  const objects = parseVenuePlanObjects(event.venuePlan.objects);
  const objectsById = new Map(objects.map((o) => [o.id, o]));
  // Legacy only: old plans may still have painted categorySlots / per-seat keys.
  const slots = parsePlanCategorySlots(event.venuePlan.categorySlots);
  const hasLegacySlots = slots.length > 0;
  const slotToCategoryId = hasLegacySlots
    ? mapSlotKeysToCategoryIds(slots, event.ticketCategories)
    : new Map<string, string>();
  const desired = buildDesiredSeats(event.id, event.venuePlanId, objects);
  const desiredByKey = new Map(desired.map((s) => [s.seatKey, s]));

  const existing = await prisma.eventSeat.findMany({
    where: { eventId, venuePlanId: event.venuePlanId },
    select: {
      id: true,
      seatKey: true,
      status: true,
      blockLabel: true,
      rowLabel: true,
      seatNumber: true,
      blockObjectId: true,
      rowIndex: true,
      seatIndex: true,
      categoryId: true,
      locked: true,
    },
  });
  const existingByKey = new Map(existing.map((s) => [s.seatKey, s]));

  const layout = parseSeatingLayoutConfig(event.seatingLayoutConfig);
  const toCreate = desired.filter((s) => !existingByKey.has(s.seatKey));
  let created = 0;
  const chunk = 500;
  for (let i = 0; i < toCreate.length; i += chunk) {
    const slice = toCreate.slice(i, i + chunk).map((s) => {
      const blockCfg = layout.blocks?.[s.blockObjectId];
      const rowLocked = blockCfg?.lockedRowIndexes?.includes(s.rowIndex) ?? false;
      const block = objectsById.get(s.blockObjectId);
      // Happy path: start unassigned. Legacy painted slots may prefill.
      const fromPlan = hasLegacySlots
        ? categoryIdFromPlan(block, s.rowIndex, s.seatIndex, slotToCategoryId)
        : undefined;
      const categoryId =
        fromPlan !== undefined ? fromPlan : (blockCfg?.categoryId ?? null);
      return {
        ...s,
        categoryId,
        locked: Boolean(blockCfg?.locked) || rowLocked,
      };
    });
    const result = await prisma.eventSeat.createMany({
      data: slice,
      skipDuplicates: true,
    });
    created += result.count;
  }

  let updated = 0;
  for (const seat of existing) {
    const next = desiredByKey.get(seat.seatKey);
    if (!next) continue;
    const block = objectsById.get(next.blockObjectId);
    const fromPlan = hasLegacySlots
      ? categoryIdFromPlan(block, next.rowIndex, next.seatIndex, slotToCategoryId)
      : undefined;
    const geometryChanged =
      seat.blockLabel !== next.blockLabel ||
      seat.rowLabel !== next.rowLabel ||
      seat.seatNumber !== next.seatNumber ||
      seat.blockObjectId !== next.blockObjectId ||
      seat.rowIndex !== next.rowIndex ||
      seat.seatIndex !== next.seatIndex;
    // Preserve event assignments. Legacy slots only fill still-unassigned available seats.
    const categoryChanged =
      seat.status === "available" &&
      seat.categoryId == null &&
      fromPlan !== undefined &&
      fromPlan !== null;

    if (geometryChanged || categoryChanged) {
      await prisma.eventSeat.update({
        where: { id: seat.id },
        data: {
          ...(geometryChanged
            ? {
                blockLabel: next.blockLabel,
                rowLabel: next.rowLabel,
                seatNumber: next.seatNumber,
                blockObjectId: next.blockObjectId,
                rowIndex: next.rowIndex,
                seatIndex: next.seatIndex,
              }
            : {}),
          ...(categoryChanged ? { categoryId: fromPlan } : {}),
        },
      });
      updated += 1;
    }
  }

  const removableIds = existing
    .filter((s) => s.status === "available" && !desiredByKey.has(s.seatKey))
    .map((s) => s.id);
  let removed = 0;
  if (removableIds.length > 0) {
    const del = await prisma.eventSeat.deleteMany({
      where: { id: { in: removableIds }, status: "available" },
    });
    removed = del.count;
  }

  const total = await prisma.eventSeat.count({ where: { eventId } });
  await syncPlanBackedCategoryCapacities(prisma, eventId);
  return { created, updated, removed, total };
}

/** Process-local: skip count queries once we know seats exist for an event. */
const eventsKnownToHaveSeats = new Set<string>();

/**
 * Hot-path guard: only materialize when this event has no seats yet.
 * Full sync stays on admin plan save via syncSeatsForVenuePlan.
 */
export async function ensureEventSeatsIfNeeded(eventId: string) {
  if (eventsKnownToHaveSeats.has(eventId)) {
    return { created: 0, updated: 0, removed: 0, total: 1, skipped: true as const };
  }
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { venuePlanId: true, seatingBookingMode: true },
  });
  if (!event?.venuePlanId || event.seatingBookingMode === "none") {
    return { created: 0, updated: 0, removed: 0, total: 0, skipped: true as const };
  }
  const total = await prisma.eventSeat.count({
    where: { eventId, venuePlanId: event.venuePlanId },
  });
  if (total > 0) {
    eventsKnownToHaveSeats.add(eventId);
    return { created: 0, updated: 0, removed: 0, total, skipped: true as const };
  }
  const result = await ensureEventSeats(eventId);
  if (result.total > 0) eventsKnownToHaveSeats.add(eventId);
  return { ...result, skipped: false as const };
}

/** Sync all events that use a venue plan (after editor save). */
export async function syncSeatsForVenuePlan(venuePlanId: string) {
  const events = await prisma.event.findMany({
    where: {
      venuePlanId,
      seatingBookingMode: { in: ["best_available", "seat_map_and_best"] },
    },
    select: { id: true },
  });
  let synced = 0;
  for (const event of events) {
    await ensureEventSeats(event.id);
    synced += 1;
  }
  return synced;
}

let lastSeatExpireMs = 0;
const SEAT_EXPIRE_THROTTLE_MS = 15_000;

function isProtectedPaymentHold(hold: {
  orderId: string | null;
  cartItem?: {
    cart?: {
      status: string;
      orders: { paymentStatus: string | null; status: string }[];
    } | null;
  } | null;
}) {
  const order = hold.cartItem?.cart?.orders?.[0];
  const paymentStatus = order?.paymentStatus;
  return Boolean(
    hold.orderId ||
      (hold.cartItem?.cart?.status === "converted" &&
        (paymentStatus === "pending" || paymentStatus === "processing")),
  );
}

/**
 * Release expired seat holds and couple inventory holds so seats cannot free
 * while inventory still looks held (which would let checkout sell without seats).
 * SEPA / pending-payment holds are never released here.
 */
export async function expireSeatHolds(now = new Date()) {
  const t = Date.now();
  if (t - lastSeatExpireMs < SEAT_EXPIRE_THROTTLE_MS) return 0;
  lastSeatExpireMs = t;

  await ensureSeatingAssignmentSchema(prisma);
  const expired = await prisma.eventSeat.findMany({
    where: {
      status: "held",
      holdExpiresAt: { lt: now },
    },
    select: { id: true, cartItemId: true },
    take: 500,
  });
  if (expired.length === 0) return 0;

  const seatIdsByCartItem = new Map<string | null, string[]>();
  for (const seat of expired) {
    const key = seat.cartItemId;
    const list = seatIdsByCartItem.get(key) ?? [];
    list.push(seat.id);
    seatIdsByCartItem.set(key, list);
  }

  const cartItemIds = [...seatIdsByCartItem.keys()].filter((id): id is string => Boolean(id));
  const holds =
    cartItemIds.length > 0
      ? await prisma.inventoryHold.findMany({
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
                      select: { paymentStatus: true, status: true },
                      orderBy: { createdAt: "desc" },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        })
      : [];
  const holdByCartItemId = new Map(
    holds.filter((h) => h.cartItemId).map((h) => [h.cartItemId as string, h]),
  );

  let freed = 0;
  await prisma.$transaction(async (tx) => {
    const orphanIds = seatIdsByCartItem.get(null) ?? [];
    if (orphanIds.length > 0) {
      await tx.eventSeat.updateMany({
        where: { id: { in: orphanIds }, status: "held" },
        data: { status: "available", holdExpiresAt: null, cartItemId: null },
      });
      freed += orphanIds.length;
    }

    for (const cartItemId of cartItemIds) {
      const seatIds = seatIdsByCartItem.get(cartItemId) ?? [];
      const hold = holdByCartItemId.get(cartItemId);

      // Protect holds tied to orders awaiting async payment (SEPA processing).
      if (hold && isProtectedPaymentHold(hold)) {
        continue;
      }

      if (hold) {
        const current = await tx.inventoryHold.findUnique({
          where: { id: hold.id },
          select: { id: true, status: true },
        });
        if (current?.status === "held") {
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: "expired" },
          });
          await tx.inventoryPool.update({
            where: { id: hold.poolId },
            data: { heldQuantity: { decrement: hold.quantity } },
          });
        }
      }

      // Free all held seats for this cart item (not only the expired subset) so inventory + seats stay aligned.
      await tx.eventSeat.updateMany({
        where: { cartItemId, status: "held" },
        data: { status: "available", holdExpiresAt: null, cartItemId: null },
      });
      freed += seatIds.length;
    }
  });

  return freed;
}
