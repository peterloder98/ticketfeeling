import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "eventTicketCategory" | "eventSeat" | "inventoryPool">;

/** Plan-backed categories: Kontingent comes from assigned, unlocked seats. */
export function isPlanBackedTicketCategory(cat: {
  freeSeating?: boolean | null;
  categoryKind?: string | null;
}): boolean {
  if (cat.freeSeating) return false;
  const kind = cat.categoryKind ?? "standard";
  return kind !== "standing" && kind !== "free_choice";
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

/**
 * Persist Kontingent for plan-backed categories from EventSeat rows:
 * capacity = seats with that categoryId and locked = false.
 * Freiverkauf / Stehplatz / freie Platzwahl are left unchanged.
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
