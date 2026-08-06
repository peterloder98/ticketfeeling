/**
 * Sale gating for events.
 *
 * Draft never sells and is not listed — unless a Vorverkaufsstart is set (save promotes
 * to announcement / scheduled) or the start is already due (release flips to Im Verkauf).
 * Announcement can auto-release when `presaleStartsAt` is reached (effective status).
 * Ticket sales require release (`presale_active` or `published`) — either stored or effective.
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

/** Statuses that auto-release to Im Verkauf when Vorverkaufsstart is reached. */
export const PRESALE_AUTO_RELEASE_STATUSES = ["announcement", "draft"] as const;

export function isEventSalesReleased(status: string): boolean {
  return (SALE_RELEASED_STATUSES as readonly string[]).includes(status);
}

/**
 * When Vorverkaufsstart is reached, announcement/draft is treated as „Im Verkauf“.
 * Stored DB status may still lag until cron/save/listing flip.
 */
export function effectiveEventStatus(
  event: { status: string; presaleStartsAt?: Date | null },
  now: Date = new Date(),
): string {
  if (
    (event.status === "announcement" || event.status === "draft") &&
    event.presaleStartsAt &&
    event.presaleStartsAt.getTime() <= now.getTime()
  ) {
    return "presale_active";
  }
  return event.status;
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
    /** Resolved cover (event or tour). Sale requires a cover. */
    coverImageUrl?: string | null;
    tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
  },
  now: Date = new Date(),
): boolean {
  if (event.status === "sold_out" || event.status === "cancelled" || event.status === "completed") {
    return false;
  }
  // Draft tour = not public / not sellable
  if (event.tour?.visibility === "draft") return false;
  const status = effectiveEventStatus(event, now);
  if (!isEventSalesReleased(status)) return false;
  const cover =
    event.coverImageUrl?.trim() || event.tour?.coverImageUrl?.trim() || "";
  if (!cover) return false;
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

/**
 * If Vorverkaufsstart is already reached, bump announcement/draft → presale_active.
 */
export function statusAfterPresaleStart(
  status: string,
  presaleStartsAt: Date | null,
  now: Date = new Date(),
): string {
  if (status !== "announcement" && status !== "draft") return status;
  if (presaleStartsAt && presaleStartsAt.getTime() <= now.getTime()) {
    return "presale_active";
  }
  return status;
}

/**
 * Persistable status for create/update.
 *
 * - Entwurf + Vorverkaufsstart gesetzt → „Verkauf geplant“ (announcement), so the event
 *   can appear publicly and auto-flip to Im Verkauf when the start is reached.
 * - Reached Vorverkaufsstart → Im Verkauf (presale_active).
 * - Auto-flip without cover stays announcement so the save does not fail with COVER_REQUIRED
 *   (listings still show it; checkout stays closed until a cover exists).
 * - Explicit „Im Verkauf“ without cover still returns a sale status — caller must assert cover.
 */
export function resolvePersistedEventStatus(opts: {
  requestedStatus: string;
  presaleStartsAt: Date | null;
  coverImageUrl?: string | null;
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  let status = opts.requestedStatus;

  // Setting a Vorverkaufsstart means scheduled public release — not forever-Entwurf.
  if (status === "draft" && opts.presaleStartsAt) {
    status = "announcement";
  }

  const afterStart = statusAfterPresaleStart(status, opts.presaleStartsAt, now);
  const explicitSale = isEventSalesReleased(opts.requestedStatus);
  const hasCover = Boolean(opts.coverImageUrl?.trim());

  if (isEventSalesReleased(afterStart) && !hasCover && !explicitSale) {
    return "announcement";
  }

  return afterStart;
}
