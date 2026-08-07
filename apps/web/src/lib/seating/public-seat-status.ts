import type { PublicSeat } from "@/lib/seating/types";

/** Map DB seat row → public status (held for this cart → held_by_you). */
export function toPublicSeatStatus(
  s: { status: string; cartItemId: string | null; locked: boolean },
  viewerCartItemIds: Set<string> | Iterable<string>,
): PublicSeat["status"] {
  const viewerSet =
    viewerCartItemIds instanceof Set ? viewerCartItemIds : new Set(viewerCartItemIds);
  if (s.locked) return "locked";
  if (s.status === "sold") return "taken";
  if (s.status === "held") {
    // Own cart → mint in-cart. Other carts → reserved (not sold hatch).
    // Expired holds are freed by expireSeatHolds (awaited before map payload).
    return s.cartItemId && viewerSet.has(s.cartItemId) ? "held_by_you" : "held";
  }
  return "available";
}
