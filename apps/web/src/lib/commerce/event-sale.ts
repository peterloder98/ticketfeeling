/**
 * Sale gating for events.
 *
 * Draft / announcement never sell — even if `presaleStartsAt` is in the past.
 * Ticket sales require an explicit release (`presale_active` or `published`).
 */

/** Organizer has released the event for ticket sales (or it sold out). */
export const SALE_RELEASED_STATUSES = [
  "presale_active",
  "published",
  "sold_out",
] as const;

/** Shown in public listings (may or may not be buyable). */
export const PUBLIC_LISTING_STATUSES = [
  "announcement",
  "presale_active",
  "published",
  "sold_out",
] as const;

export function isEventSalesReleased(status: string): boolean {
  return (SALE_RELEASED_STATUSES as readonly string[]).includes(status);
}

/** Categories may still be added/removed only before first sale release. */
export function canMutateEventCategories(status: string): boolean {
  return !isEventSalesReleased(status);
}

export function isEventSaleOpen(
  event: {
    status: string;
    presaleStartsAt?: Date | null;
    presaleEndsAt?: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (event.status === "sold_out" || event.status === "cancelled" || event.status === "completed") {
    return false;
  }
  if (!isEventSalesReleased(event.status)) return false;
  if (event.presaleStartsAt && event.presaleStartsAt.getTime() > now.getTime()) return false;
  if (event.presaleEndsAt && event.presaleEndsAt.getTime() < now.getTime()) return false;
  return true;
}

export function isCategorySaleWindowOpen(
  category: {
    saleStartsAt?: Date | null;
    saleEndsAt?: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (category.saleStartsAt && category.saleStartsAt.getTime() > now.getTime()) return false;
  if (category.saleEndsAt && category.saleEndsAt.getTime() < now.getTime()) return false;
  return true;
}
