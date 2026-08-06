import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";

type SeatLike = {
  status: string;
  locked: boolean;
  categoryId: string | null;
};

/**
 * Free seats on the saalplan that are actually sellable.
 * When categories are assigned, unassigned seats are excluded (not pickable).
 * Optional categoryId filters to one price category.
 */
export function countSellableAvailableSeats(
  seats: SeatLike[],
  opts?: { categoryId?: string | null; assignedCategoryIds?: Iterable<string> },
): number {
  const hasAssignments = seats.some((s) => s.categoryId);
  const assigned =
    opts?.assignedCategoryIds != null ? new Set(opts.assignedCategoryIds) : null;
  let n = 0;
  for (const s of seats) {
    if (s.status !== "available" || s.locked) continue;
    if (opts?.categoryId) {
      if (hasAssignments && s.categoryId !== opts.categoryId) continue;
    } else if (hasAssignments) {
      if (!s.categoryId) continue;
      if (assigned && !assigned.has(s.categoryId)) continue;
    }
    n += 1;
  }
  return n;
}

export function flattenMapSeats(map: SeatMapPayload): PublicSeat[] {
  return [...map.blocks.flatMap((b) => b.seats), ...(map.standingSeats ?? [])];
}

/** Available (pickable) seats for one category on a loaded public map. */
export function countAvailableForCategory(map: SeatMapPayload, categoryId: string): number {
  const assignedCategoryIds = map.categories.map((c) => c.id);
  return countSellableAvailableSeats(flattenMapSeats(map), {
    categoryId,
    assignedCategoryIds,
  });
}

/**
 * Display cap for the saalplan counter when mixing categories.
 * Empty selection → typical per-category max (not the sum of all caps).
 * With picks → sum of per-category caps for categories that already have seats.
 */
export function multiCategorySelectionCap(
  categories: { id: string; maxPerOrder: number; available: number }[],
  selectedByCategory: Record<string, string[]>,
  availableOnMap?: (categoryId: string) => number,
): number {
  const capFor = (c: { id: string; maxPerOrder: number; available: number }) => {
    const onMap = availableOnMap ? availableOnMap(c.id) : c.available;
    return Math.min(c.maxPerOrder, Math.max(0, c.available), Math.max(0, onMap));
  };

  const active = categories.filter((c) => (selectedByCategory[c.id]?.length ?? 0) > 0);
  if (active.length === 0) {
    const caps = categories.map(capFor).filter((n) => n > 0);
    return caps.length ? Math.max(...caps) : 1;
  }
  return Math.max(
    1,
    active.reduce((sum, c) => sum + capFor(c), 0),
  );
}
