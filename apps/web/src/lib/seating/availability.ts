import type { PublicSeat, SeatMapPayload } from "@/lib/seating/types";

type SeatLike = {
  status: string;
  locked: boolean;
  categoryId: string | null;
  holdExpiresAt?: Date | string | null;
};

function isTemporarilyHeld(s: SeatLike, now: Date): boolean {
  if (s.status !== "held") return false;
  if (!s.holdExpiresAt) return true;
  const expires =
    s.holdExpiresAt instanceof Date ? s.holdExpiresAt : new Date(s.holdExpiresAt);
  if (Number.isNaN(expires.getTime())) return true;
  return expires >= now;
}

/**
 * Free seats on the saalplan that are actually sellable.
 * When categories are assigned, unassigned seats are excluded (not pickable).
 * Optional categoryId filters to one price category.
 */
export function countSellableAvailableSeats(
  seats: SeatLike[],
  opts?: { categoryId?: string | null; assignedCategoryIds?: Iterable<string>; now?: Date },
): number {
  const now = opts?.now ?? new Date();
  const hasAssignments = seats.some((s) => s.categoryId);
  const assigned =
    opts?.assignedCategoryIds != null ? new Set(opts.assignedCategoryIds) : null;
  let n = 0;
  for (const s of seats) {
    if (s.locked) continue;
    const free =
      s.status === "available" ||
      // Public map status already normalized, or raw DB row with expired hold.
      (s.status === "held" && !isTemporarilyHeld(s, now));
    if (!free) continue;
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
