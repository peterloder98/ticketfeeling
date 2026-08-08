/**
 * Sale gating for events.
 *
 * Draft never sells and is not listed — unless a Vorverkaufsstart is set (save promotes
 * to announcement / scheduled) or the start is already due AND canStartSales() passes
 * (release flips to Im Verkauf). Cover is mandatory for any sales activation.
 * Announcement can auto-release when `presaleStartsAt` is reached (effective status)
 * only when canStartSales() is ok. Ticket sales require release (`presale_active` or
 * `published`) — either stored or effective. `paused` hides the event from public
 * listings and closes sales until resumed.
 */

import { prisma } from "@/lib/db";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";

/** Organizer has released the event for ticket sales (or it sold out). */
export const SALE_RELEASED_STATUSES = [
  "presale_active",
  "published",
  "sold_out",
] as const;

/** „Im Verkauf“ statuses that can be paused from the admin header. */
export const PAUSABLE_STATUSES = ["presale_active", "published"] as const;

/** Shown in public listings (may or may not be buyable). Paused is intentionally absent. */
export const PUBLIC_LISTING_STATUSES = [
  "announcement",
  "presale_active",
  "published",
  "sold_out",
] as const;

/** Statuses that auto-release to Im Verkauf when Vorverkaufsstart is reached. */
export const PRESALE_AUTO_RELEASE_STATUSES = ["announcement", "draft"] as const;

export type SalesBlockReason =
  | "MISSING_EVENT_COVER"
  | "MISSING_EVENT_START"
  | "MISSING_CATEGORIES"
  | "MISSING_PRICES"
  | "TOUR_DRAFT";

export type CanStartSalesInput = {
  status?: string;
  coverImageUrl?: string | null;
  ticketHeroImageUrl?: string | null;
  eventStartsAt?: Date | null;
  presaleStartsAt?: Date | null;
  saleClosedEarly?: boolean | null;
  tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
  /** At least one sellable category with a non-negative price. */
  categories?: Array<{
    priceGrossCents?: number | null;
    capacity?: number | null;
  }> | null;
  /** Optional: skip category checks when caller only has cover context. */
  skipCategoryChecks?: boolean;
};

export type CanStartSalesResult = {
  ok: boolean;
  reasons: SalesBlockReason[];
};

export function isEventSalesReleased(status: string): boolean {
  return (SALE_RELEASED_STATUSES as readonly string[]).includes(status);
}

export function isEventPausable(status: string): boolean {
  return (PAUSABLE_STATUSES as readonly string[]).includes(status);
}

/** True when a resolvable event/tour cover URL is present (upload already validated). */
export function hasValidEventCover(input: {
  coverImageUrl?: string | null;
  tour?: { coverImageUrl?: string | null } | null;
}): boolean {
  return Boolean(resolveEventCoverUrl(input));
}

/**
 * Central pre-flight: may this event enter / stay in public ticket sales?
 * Used by manual start, scheduled start, cron, and post-cover auto-activate.
 */
export function canStartSales(
  event: CanStartSalesInput,
): CanStartSalesResult {
  const reasons: SalesBlockReason[] = [];

  if (!hasValidEventCover(event)) {
    reasons.push("MISSING_EVENT_COVER");
  }

  // undefined = caller didn't load the field (skip); null = known missing
  if (event.eventStartsAt !== undefined && !event.eventStartsAt) {
    reasons.push("MISSING_EVENT_START");
  }

  if (event.tour?.visibility === "draft") {
    reasons.push("TOUR_DRAFT");
  }

  if (!event.skipCategoryChecks) {
    const cats = event.categories ?? [];
    if (cats.length === 0) {
      reasons.push("MISSING_CATEGORIES");
    } else {
      const priced = cats.some(
        (c) => typeof c.priceGrossCents === "number" && c.priceGrossCents >= 0,
      );
      if (!priced) reasons.push("MISSING_PRICES");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function salesBlockReasonLabel(reason: SalesBlockReason): string {
  switch (reason) {
    case "MISSING_EVENT_COVER":
      return "Eventcover fehlt";
    case "MISSING_EVENT_START":
      return "Eventtermin fehlt";
    case "MISSING_CATEGORIES":
      return "Keine Ticketkategorie";
    case "MISSING_PRICES":
      return "Keine Preise";
    case "TOUR_DRAFT":
      return "Tour noch Entwurf";
    default:
      return reason;
  }
}

/**
 * When Vorverkaufsstart is reached, announcement/draft is treated as „Im Verkauf“
 * only if canStartSales passes (cover + essentials). Otherwise stay offline.
 * Paused / cancelled / completed are never auto-flipped.
 */
export function effectiveEventStatus(
  event: {
    status: string;
    presaleStartsAt?: Date | null;
    coverImageUrl?: string | null;
    eventStartsAt?: Date | null;
    tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
    categories?: CanStartSalesInput["categories"];
    skipCategoryChecks?: boolean;
  },
  now: Date = new Date(),
): string {
  if (
    (event.status === "announcement" || event.status === "draft") &&
    event.presaleStartsAt &&
    event.presaleStartsAt.getTime() <= now.getTime()
  ) {
    const ready = canStartSales({
      coverImageUrl: event.coverImageUrl,
      eventStartsAt: event.eventStartsAt,
      tour: event.tour,
      categories: event.categories,
      // Listings often lack categories — cover is the hard gate for effective flip.
      skipCategoryChecks: event.skipCategoryChecks ?? event.categories == null,
    });
    if (ready.ok) return "presale_active";
    // Cover (or other blockers) → stay announcement/draft for public/effective status
    return event.status === "draft" ? "draft" : "announcement";
  }
  return event.status;
}

/**
 * True when the event already has committed inventory: sold/held pool qty,
 * sold/held seats, or issued tickets. Used to lock creating new price categories.
 */
export async function eventHasSoldOrHeldInventory(eventId: string): Promise<boolean> {
  const pool = await prisma.inventoryPool.findFirst({
    where: {
      eventId,
      OR: [{ soldQuantity: { gt: 0 } }, { heldQuantity: { gt: 0 } }],
    },
    select: { id: true },
  });
  if (pool) return true;

  const seat = await prisma.eventSeat.findFirst({
    where: { eventId, status: { in: ["held", "sold"] } },
    select: { id: true },
  });
  if (seat) return true;

  const ticket = await prisma.ticket.findFirst({
    where: { eventId },
    select: { id: true },
  });
  return Boolean(ticket);
}

/**
 * New price categories are allowed until the first real sold/held ticket (or seat).
 * Editing existing categories stays allowed separately — this only gates create.
 */
export async function canCreateEventCategories(eventId: string): Promise<boolean> {
  return !(await eventHasSoldOrHeldInventory(eventId));
}

export function isEventSaleOpen(
  event: {
    status: string;
    presaleStartsAt?: Date | null;
    presaleEndsAt?: Date | null;
    /** Admin ended online/box-office sale early („Verkauf vorzeitig beenden“). */
    saleClosedEarly?: boolean | null;
    coverImageUrl?: string | null;
    eventStartsAt?: Date | null;
    tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
    categories?: CanStartSalesInput["categories"];
  },
  now: Date = new Date(),
): boolean {
  if (
    event.status === "sold_out" ||
    event.status === "cancelled" ||
    event.status === "completed" ||
    event.status === "paused"
  ) {
    return false;
  }
  if (event.saleClosedEarly) return false;
  if (event.tour?.visibility === "draft") return false;

  // Hard gate: no cover → never buyable (even if DB status was released earlier).
  if (!hasValidEventCover(event)) return false;

  const status = effectiveEventStatus(
    {
      status: event.status,
      presaleStartsAt: event.presaleStartsAt,
      coverImageUrl: event.coverImageUrl,
      eventStartsAt: event.eventStartsAt,
      tour: event.tour,
      categories: event.categories,
      skipCategoryChecks: true,
    },
    now,
  );
  if (!isEventSalesReleased(status)) return false;
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
 * If Vorverkaufsstart is already reached, bump announcement/draft → presale_active
 * only when cover (+ essentials) allow it. Otherwise keep scheduled/offline status.
 */
export function statusAfterPresaleStart(
  status: string,
  presaleStartsAt: Date | null,
  now: Date = new Date(),
  coverOk = true,
): string {
  if (status !== "announcement" && status !== "draft") return status;
  if (presaleStartsAt && presaleStartsAt.getTime() <= now.getTime() && coverOk) {
    return "presale_active";
  }
  return status === "draft" && presaleStartsAt ? "announcement" : status;
}

/**
 * Persistable status for create/update.
 *
 * - Entwurf + Vorverkaufsstart gesetzt → „Verkauf geplant“ (announcement), so the event
 *   can appear publicly and auto-flip to Im Verkauf when the start is reached AND cover ok.
 * - Reached Vorverkaufsstart + canStartSales → Im Verkauf (presale_active).
 * - Manual Im Verkauf without cover → caller must throw; this returns announcement if start set.
 */
export function resolvePersistedEventStatus(opts: {
  requestedStatus: string;
  presaleStartsAt: Date | null;
  coverImageUrl?: string | null;
  eventStartsAt?: Date | null;
  tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
  categories?: CanStartSalesInput["categories"];
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  let status = opts.requestedStatus;

  // Setting a Vorverkaufsstart means scheduled public release — not forever-Entwurf.
  if (status === "draft" && opts.presaleStartsAt) {
    status = "announcement";
  }

  const coverInput = {
    coverImageUrl: opts.coverImageUrl,
    eventStartsAt: opts.eventStartsAt,
    tour: opts.tour,
    categories: opts.categories,
    skipCategoryChecks: opts.categories == null,
  };
  const ready = canStartSales(coverInput);

  // Manual / requested on-sale without readiness: do not persist released status.
  if (isEventSalesReleased(status) && !ready.ok) {
    if (opts.presaleStartsAt) return "announcement";
    return "draft";
  }

  return statusAfterPresaleStart(status, opts.presaleStartsAt, now, ready.ok);
}

/** Planned start is due but sales stayed offline because canStartSales failed. */
export function isSalesActivationBlocked(event: {
  status: string;
  presaleStartsAt?: Date | null;
  coverImageUrl?: string | null;
  eventStartsAt?: Date | null;
  tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
  categories?: CanStartSalesInput["categories"];
}, now: Date = new Date()): CanStartSalesResult | null {
  if (
    event.status !== "announcement" &&
    event.status !== "draft"
  ) {
    return null;
  }
  if (!event.presaleStartsAt || event.presaleStartsAt.getTime() > now.getTime()) {
    return null;
  }
  const result = canStartSales(
    {
      coverImageUrl: event.coverImageUrl,
      eventStartsAt: event.eventStartsAt,
      tour: event.tour,
      categories: event.categories,
      skipCategoryChecks: event.categories == null,
    },
    now,
  );
  return result.ok ? null : result;
}

export function logSalesActivationBlocked(opts: {
  eventId: string;
  reasons: SalesBlockReason[];
  presaleStartsAt?: Date | null;
}) {
  console.info(
    JSON.stringify({
      type: "EVENT_SALES_ACTIVATION_BLOCKED",
      eventId: opts.eventId,
      timestamp: new Date().toISOString(),
      reasonCodes: opts.reasons,
      presaleStartsAt: opts.presaleStartsAt?.toISOString() ?? null,
    }),
  );
}

export function logSalesActivated(opts: {
  eventId: string;
  fromStatus: string;
  trigger: "manual" | "cron" | "presale_due" | "cover_upload" | "save";
}) {
  console.info(
    JSON.stringify({
      type: "EVENT_SALES_ACTIVATED",
      eventId: opts.eventId,
      timestamp: new Date().toISOString(),
      fromStatus: opts.fromStatus,
      trigger: opts.trigger,
    }),
  );
}
