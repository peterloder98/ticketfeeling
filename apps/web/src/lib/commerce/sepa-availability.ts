/** SEPA availability relative to event start (calendar days before start). */

export const SEPA_MIN_DAYS_PRESETS = [0, 3, 5, 7, 10, 14] as const;

export const DEFAULT_SEPA_MIN_DAYS_BEFORE_EVENT = 7;

export type SepaTicketReleaseMode = "after_confirmed" | "after_submission";

export function normalizeSepaTicketReleaseMode(value: unknown): SepaTicketReleaseMode {
  return value === "after_submission" ? "after_submission" : "after_confirmed";
}

/**
 * Resolve effective cutoff days: event override wins when set, else org default.
 */
export function resolveSepaMinDaysBeforeEvent(input: {
  orgDays: number | null | undefined;
  eventDays?: number | null | undefined;
}): number {
  if (typeof input.eventDays === "number" && Number.isFinite(input.eventDays) && input.eventDays >= 0) {
    return Math.round(input.eventDays);
  }
  if (typeof input.orgDays === "number" && Number.isFinite(input.orgDays) && input.orgDays >= 0) {
    return Math.round(input.orgDays);
  }
  return DEFAULT_SEPA_MIN_DAYS_BEFORE_EVENT;
}

/** SEPA is available until `eventStartsAt - days`. At/after that instant it is disabled. */
export function isSepaAvailableForEventStart(
  eventStartsAt: Date | null | undefined,
  minDaysBeforeEvent: number,
  now = new Date(),
): boolean {
  if (!eventStartsAt) return true;
  const ms = minDaysBeforeEvent * 24 * 60 * 60 * 1000;
  // At the exact cutoff instant SEPA is already disabled.
  return eventStartsAt.getTime() - now.getTime() > ms;
}

/**
 * For a cart/checkout with multiple events, SEPA must be available for the soonest event.
 * Uses the most restrictive (highest) effective day count among items when overrides differ.
 */
export function isSepaDisabledForCheckout(input: {
  items: Array<{
    eventStartsAt: Date | null | undefined;
    eventSepaMinDays?: number | null;
  }>;
  orgSepaMinDays: number | null | undefined;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.items.length === 0) return false;

  for (const item of input.items) {
    if (!item.eventStartsAt) continue;
    const days = resolveSepaMinDaysBeforeEvent({
      orgDays: input.orgSepaMinDays,
      eventDays: item.eventSepaMinDays,
    });
    if (!isSepaAvailableForEventStart(item.eventStartsAt, days, now)) {
      return true;
    }
  }
  return false;
}

/** Hold extension for orders awaiting async payment (SEPA). */
export function sepaReservationExpiresAt(eventStartsAt: Date | null | undefined, now = new Date()): Date {
  if (eventStartsAt) {
    // Keep seats until event start (payment must clear before then for SEPA window).
    return new Date(eventStartsAt.getTime());
  }
  // Fallback: 14 calendar days
  return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
}
