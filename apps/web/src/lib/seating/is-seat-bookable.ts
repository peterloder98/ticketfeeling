/**
 * Central hard-constraint seat bookability policy.
 * Optimization / Bestplatz / UI never override these rules.
 * Reuses existing EventSeat statuses: available | held | sold (+ locked flag).
 */

export type SeatUnbookableReason =
  | "sold"
  | "locked"
  | "held_by_other"
  | "held_by_you"
  | "wrong_category"
  | "wrong_seat_type"
  | "not_available"
  | "missing"
  | "standing_not_allowed";

export type SeatBookableSeat = {
  id?: string;
  status: string;
  locked?: boolean | null;
  categoryId?: string | null;
  seatType?: string | null;
  seatKey?: string | null;
  cartItemId?: string | null;
  holdExpiresAt?: Date | string | null;
};

export type SeatBookableContext = {
  now?: Date;
  /** When set (and assignments exist), seat.categoryId must match. */
  expectedCategoryId?: string | null;
  /** Treat category mismatch as blocking even when categoryId is null on seat. */
  requireCategoryMatch?: boolean;
  /** Cart item ids that own this hold (viewer / current claim target). */
  ownerCartItemIds?: Iterable<string> | null;
  /** Single owner cart item (merged into ownerCartItemIds). */
  ownerCartItemId?: string | null;
  /**
   * When true, timed-out holds count as free (bookable) — claim path must
   * reclaim them before updateMany. Sold is never reclaimable.
   */
  allowExpiredHoldReclaim?: boolean;
  /**
   * Restrict seatType. Null/undefined = no restriction.
   * Use for wheelchair primary picks: ["wheelchair"] or ["wheelchair","standard"].
   */
  allowedSeatTypes?: readonly string[] | null;
  /** When false, seats with :ST: in seatKey are not bookable via map pick. */
  allowStanding?: boolean;
};

function holdExpiryDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when status is held and the hold has not timed out. */
export function isActiveHold(
  seat: Pick<SeatBookableSeat, "status" | "holdExpiresAt">,
  now: Date = new Date(),
): boolean {
  if (seat.status !== "held") return false;
  const expires = holdExpiryDate(seat.holdExpiresAt);
  if (!expires) return true; // orphan / no expiry → treat as active until cleanup
  return expires >= now;
}

export function isHoldExpired(
  seat: Pick<SeatBookableSeat, "status" | "holdExpiresAt">,
  now: Date = new Date(),
): boolean {
  if (seat.status !== "held") return false;
  const expires = holdExpiryDate(seat.holdExpiresAt);
  if (!expires) return false;
  return expires < now;
}

function ownerSet(ctx: SeatBookableContext): Set<string> {
  const ids = new Set<string>();
  if (ctx.ownerCartItemId) ids.add(ctx.ownerCartItemId);
  if (ctx.ownerCartItemIds) {
    for (const id of ctx.ownerCartItemIds) ids.add(id);
  }
  return ids;
}

/**
 * Hard constraint: can this seat be newly claimed / kept for sale?
 * Does not mutate state — callers use claim helpers for atomic updates.
 */
export function isSeatBookable(
  seat: SeatBookableSeat | null | undefined,
  ctx: SeatBookableContext = {},
): { ok: true } | { ok: false; reason: SeatUnbookableReason } {
  if (!seat) return { ok: false, reason: "missing" };

  const now = ctx.now ?? new Date();

  // Sold has absolute priority — never bookable, never freed by expire.
  if (seat.status === "sold") return { ok: false, reason: "sold" };

  if (seat.locked) return { ok: false, reason: "locked" };

  if (ctx.allowStanding === false && seat.seatKey?.includes(":ST:")) {
    return { ok: false, reason: "standing_not_allowed" };
  }

  if (ctx.requireCategoryMatch || ctx.expectedCategoryId) {
    const expected = ctx.expectedCategoryId ?? null;
    if (expected && seat.categoryId && seat.categoryId !== expected) {
      return { ok: false, reason: "wrong_category" };
    }
    if (ctx.requireCategoryMatch && expected && !seat.categoryId) {
      return { ok: false, reason: "wrong_category" };
    }
  }

  if (ctx.allowedSeatTypes && ctx.allowedSeatTypes.length > 0) {
    const type = seat.seatType ?? "standard";
    if (!ctx.allowedSeatTypes.includes(type)) {
      return { ok: false, reason: "wrong_seat_type" };
    }
  }

  if (seat.status === "available") return { ok: true };

  if (seat.status === "held") {
    if (ctx.allowExpiredHoldReclaim && isHoldExpired(seat, now)) {
      return { ok: true };
    }
    const owners = ownerSet(ctx);
    if (seat.cartItemId && owners.has(seat.cartItemId)) {
      // Own active hold — valid to keep in cart, not a fresh external claim target.
      return { ok: false, reason: "held_by_you" };
    }
    if (isActiveHold(seat, now)) {
      return { ok: false, reason: "held_by_other" };
    }
    // Expired without reclaim flag → not bookable until expire job runs
    // (callers that need soft-claim set allowExpiredHoldReclaim).
    return { ok: false, reason: "not_available" };
  }

  return { ok: false, reason: "not_available" };
}

/** True when seat may be claimed into a cart/order (fresh take or expired reclaim). */
export function isSeatClaimable(
  seat: SeatBookableSeat | null | undefined,
  ctx: SeatBookableContext = {},
): boolean {
  const result = isSeatBookable(seat, {
    ...ctx,
    allowExpiredHoldReclaim: ctx.allowExpiredHoldReclaim ?? true,
  });
  if (!result.ok) {
    // Own hold is not claimable as a "new" seat, but scrub treats it as still owned.
    return false;
  }
  return true;
}

/** Seat still validly held by this cart item (checkout / scrub keep). */
export function isSeatHeldByOwner(
  seat: SeatBookableSeat | null | undefined,
  cartItemId: string,
  now: Date = new Date(),
): boolean {
  if (!seat) return false;
  if (seat.status === "sold" || seat.locked) return false;
  if (seat.status !== "held") return false;
  if (seat.cartItemId !== cartItemId) return false;
  return isActiveHold(seat, now);
}

/** Map policy reason → cart/API error code (German messages in cart-error-messages). */
export function seatUnbookableToErrorCode(reason: SeatUnbookableReason): string {
  switch (reason) {
    case "sold":
    case "held_by_other":
    case "held_by_you":
    case "locked":
    case "wrong_category":
    case "wrong_seat_type":
    case "standing_not_allowed":
    case "not_available":
    case "missing":
      return "SEATS_UNAVAILABLE";
    default:
      return "SEATS_UNAVAILABLE";
  }
}

/** Prisma-friendly where for sellable candidates (includes soft-expired holds). */
export function sellableSeatPrismaWhere(opts: {
  eventId: string;
  categoryId?: string | null;
  now?: Date;
  includeStanding?: boolean;
}): {
  eventId: string;
  locked: false;
  categoryId?: string;
  seatKey?: { not: { contains: string } };
  OR: Array<
    | { status: "available" }
    | { status: "held"; holdExpiresAt: { lt: Date } }
  >;
} {
  const now = opts.now ?? new Date();
  return {
    eventId: opts.eventId,
    locked: false,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.includeStanding === false
      ? { seatKey: { not: { contains: ":ST:" } } }
      : {}),
    OR: [{ status: "available" }, { status: "held", holdExpiresAt: { lt: now } }],
  };
}
