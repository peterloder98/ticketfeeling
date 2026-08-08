/**
 * Structured seat-conflict logging — minimal PII (no emails / names).
 * Impossible / unexpected states use `console.error` for monitoring hooks.
 */

export type SeatConflictLog = {
  type:
    | "claim_conflict"
    | "expired_hold_reclaim"
    | "sold_transition_conflict"
    | "cart_scrub"
    | "impossible_state"
    | "checkout_seat_mismatch";
  eventId?: string | null;
  seatIds?: string[];
  channel?: string;
  cartItemId?: string | null;
  cartId?: string | null;
  orderId?: string | null;
  detail?: Record<string, unknown>;
};

export function logSeatConflict(entry: SeatConflictLog): void {
  const payload = {
    ts: new Date().toISOString(),
    ...entry,
  };
  if (entry.type === "impossible_state" || entry.type === "sold_transition_conflict") {
    console.error("[seat-conflict]", JSON.stringify(payload));
    return;
  }
  console.warn("[seat-conflict]", JSON.stringify(payload));
}
