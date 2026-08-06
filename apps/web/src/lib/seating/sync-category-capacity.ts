import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "eventTicketCategory" | "eventSeat" | "inventoryPool">;

export function eventHasReservedSeating(mode: string | null | undefined): boolean {
  return mode === "best_available" || mode === "seat_map_and_best";
}

/**
 * Plan-backed categories: Kontingent comes from assigned, unlocked EventSeat rows.
 * - Sitzplatz / VIP / Rollstuhl: numbered (and standing) places painted in Saalplan
 * - Stehplatz: standing places assigned on Saalplan (when seating is enabled);
 *   after assignment, Preiskategorie Kontingent may rematerialize units (geometry
 *   capacity is only the initial recommendation)
 * - Freie Platzwahl / Freiverkauf without seating: manual capacity
 */
export function isPlanBackedTicketCategory(cat: {
  freeSeating?: boolean | null;
  categoryKind?: string | null;
  seatingBookingMode?: string | null;
  seatingEnabled?: boolean;
}): boolean {
  const kind = cat.categoryKind ?? "standard";
  if (kind === "free_choice") return false;
  if (kind === "standing") {
    if (typeof cat.seatingEnabled === "boolean") return cat.seatingEnabled;
    if (cat.seatingBookingMode != null) {
      return eventHasReservedSeating(cat.seatingBookingMode);
    }
    // syncPlanBackedCategoryCapacities only runs for seating events.
    return true;
  }
  if (cat.freeSeating) return false;
  return true;
}

/**
 * Effective Kontingent for availability checks.
 * When plan-backed seat counts are known, they win over a stale category.capacity
 * (e.g. Stehplatz still at wizard default while nothing is assigned).
 */
export function resolveSellableCategoryCapacity(input: {
  categoryCapacity: number;
  categoryKind?: string | null;
  freeSeating?: boolean | null;
  seatingBookingMode?: string | null;
  seatingEnabled?: boolean;
  assignedUnlockedSeatCount?: number | null;
}): number {
  const planBacked = isPlanBackedTicketCategory(input);
  const seatingOn =
    typeof input.seatingEnabled === "boolean"
      ? input.seatingEnabled
      : eventHasReservedSeating(input.seatingBookingMode);
  if (planBacked && seatingOn && typeof input.assignedUnlockedSeatCount === "number") {
    return Math.max(0, input.assignedUnlockedSeatCount);
  }
  return Math.max(0, input.categoryCapacity);
}

/** Count seats assigned to a category that are not gesperrt (locked). */
export function countSellableAssignedSeats(
  seats: { categoryId: string | null; locked: boolean }[],
  categoryId: string,
): number {
  let n = 0;
  for (const s of seats) {
    if (s.categoryId === categoryId && !s.locked) n += 1;
  }
  return n;
}

/** Per-category sellable counts (assigned + not locked). Missing ids → 0. */
export function sellableSeatCountsByCategory(
  seats: { categoryId: string | null; locked: boolean }[],
  categoryIds: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of categoryIds) counts[id] = 0;
  for (const s of seats) {
    if (s.categoryId && !s.locked && s.categoryId in counts) {
      counts[s.categoryId] += 1;
    }
  }
  return counts;
}

/** DB groupBy: assigned unlocked seats per category (missing → 0). */
export async function assignedUnlockedSeatCounts(
  db: Pick<PrismaClient, "eventSeat">,
  eventId: string,
  categoryIds: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const id of categoryIds) result[id] = 0;
  if (categoryIds.length === 0) return result;

  const grouped = await db.eventSeat.groupBy({
    by: ["categoryId"],
    where: {
      eventId,
      locked: false,
      categoryId: { in: categoryIds },
    },
    _count: { _all: true },
  });
  for (const row of grouped) {
    if (row.categoryId) result[row.categoryId] = row._count._all;
  }
  return result;
}

/**
 * Persist Kontingent for plan-backed categories from EventSeat rows:
 * capacity = seats with that categoryId and locked = false.
 * Freiverkauf / freie Platzwahl are left unchanged.
 * Stehplatz on seating events is included (assigned standing places).
 */
export async function syncPlanBackedCategoryCapacities(
  db: Db,
  eventId: string,
): Promise<Record<string, number>> {
  const categories = await db.eventTicketCategory.findMany({
    where: { eventId, status: "active" },
    select: {
      id: true,
      freeSeating: true,
      categoryKind: true,
      capacity: true,
      pools: {
        select: { id: true, soldQuantity: true, heldQuantity: true, capacity: true },
      },
    },
  });

  const planBacked = categories.filter(isPlanBackedTicketCategory);
  if (planBacked.length === 0) return {};

  const grouped = await db.eventSeat.groupBy({
    by: ["categoryId"],
    where: {
      eventId,
      locked: false,
      categoryId: { in: planBacked.map((c) => c.id) },
    },
    _count: { _all: true },
  });

  const countById = new Map<string, number>();
  for (const row of grouped) {
    if (row.categoryId) countById.set(row.categoryId, row._count._all);
  }

  const result: Record<string, number> = {};
  for (const cat of planBacked) {
    const capacity = countById.get(cat.id) ?? 0;
    result[cat.id] = capacity;

    if (cat.capacity !== capacity) {
      await db.eventTicketCategory.update({
        where: { id: cat.id },
        data: { capacity },
      });
    }

    // Each channel pool may carry the full category capacity (shared inventory).
    // Availability is enforced as shared remaining across pools — never sum capacities.
    for (const pool of cat.pools) {
      const newCap = Math.max(pool.soldQuantity + pool.heldQuantity, capacity);
      if (pool.capacity !== newCap) {
        await db.inventoryPool.update({
          where: { id: pool.id },
          data: { capacity: newCap },
        });
      }
    }
  }

  return result;
}
