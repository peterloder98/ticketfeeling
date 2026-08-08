import type { PublicSeat } from "@/lib/seating/types";

/** Map DB seat row → public status (held for this cart → held_by_you). */
export function toPublicSeatStatus(
  s: {
    status: string;
    cartItemId: string | null;
    locked: boolean;
    holdExpiresAt?: Date | string | null;
  },
  viewerCartItemIds: Set<string> | Iterable<string>,
  now: Date = new Date(),
): PublicSeat["status"] {
  const viewerSet =
    viewerCartItemIds instanceof Set ? viewerCartItemIds : new Set(viewerCartItemIds);
  if (s.locked) return "locked";
  if (s.status === "sold") return "taken";
  if (s.status === "held") {
    // Treat timed-out holds as free without blocking the map on expire transactions.
    if (s.holdExpiresAt) {
      const expires =
        s.holdExpiresAt instanceof Date ? s.holdExpiresAt : new Date(s.holdExpiresAt);
      if (!Number.isNaN(expires.getTime()) && expires < now) {
        return "available";
      }
    }
    // Own cart → mint in-cart. Other carts → reserved (not sold hatch).
    return s.cartItemId && viewerSet.has(s.cartItemId) ? "held_by_you" : "held";
  }
  return "available";
}
