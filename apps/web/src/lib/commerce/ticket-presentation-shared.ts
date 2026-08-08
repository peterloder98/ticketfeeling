import type { ResolvedTicketDoors } from "@/lib/commerce/ticket-doors";

/**
 * Client-safe ticket presentation constants + pure helpers.
 * Keep Prisma / DB loaders in `ticket-presentation.ts` only.
 */

export const TF_NAVY = "#0F2747";
export const TF_TEAL = "#14B8A6";
export const TF_GOLD = "#D6A642";
export const TF_MUTED = "#64748B";
export const TF_INK = "#0B1421";
export const TF_LINE = "#E5E7EB";
export const TF_PAPER = "#FFFFFF";
export const TF_SOFT = "#F8FAFC";
/** Site/meta claim — not shown on the ticket face (BrandLogo alone). */
export const TF_TAGLINE = "Mehr als ein Ticket";
export const TF_PRINT_HINT =
  "Am Einlass auf dem Smartphone vorzeigen oder ausdrucken.";
export const TF_QR_HINT = "Am Einlass vorzeigen.";
/**
 * Max CSS box for QR-stub sponsor logos (scale=1).
 * Logos use leftover air above/below the QR block; never shrink the QR below its floor.
 */
export const TICKET_SPONSOR_LOGO_MAX_H_PX = 52;
export const TICKET_SPONSOR_LOGO_MAX_W_PX = 156;
/** Admin resize range — relative to the max box above. */
export const SPONSOR_LOGO_SCALE_MIN = 0.45;
export const SPONSOR_LOGO_SCALE_MAX = 1;
/** Floor for QR plate when sponsors are present — shrink logos, never the QR. */
export const TICKET_QR_MIN_PX = 112;

export function clampSponsorLogoScale(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(
    SPONSOR_LOGO_SCALE_MAX,
    Math.max(SPONSOR_LOGO_SCALE_MIN, Math.round(n * 100) / 100),
  );
}

export function sponsorLogoBoxForScale(scale: number | null | undefined): {
  maxW: number;
  maxH: number;
} {
  const s = clampSponsorLogoScale(scale ?? 1);
  return {
    maxW: Math.round(TICKET_SPONSOR_LOGO_MAX_W_PX * s),
    maxH: Math.round(TICKET_SPONSOR_LOGO_MAX_H_PX * s),
  };
}

/**
 * Print@Home ticket BODY (not the A4 sheet): landscape ~2:1 strip.
 * Slightly wider than 2.0 (~11% shorter) from denser middle spacing — not a uniform scale-down.
 * Lock this ratio in HTML/CSS and PDF — never let A4 height stretch the ticket.
 */
export const TICKET_BODY_ASPECT = 2.22;
/** Cover | info | QR column fractions (must sum ≤ 100). Cover ~28–30% for long titles. */
export const TICKET_COL_COVER = 0.29;
export const TICKET_COL_QR = 0.25;

/**
 * Shared TicketFace geometry — HTML, print HTML, and PDFKit must use these
 * so online preview and Print@Home stay 1:1 for every event.
 */
/** Outer corner radius (CSS px / PDF pt at ~900px ticket width). */
export const TICKET_CORNER_RADIUS_PX = 14;
/** Brand lockup display height in the info column (centered, not oversized). */
export const TICKET_BRAND_LOGO_H_PX = 36;
/** Gap below brand lockup before event title (TicketFace `mt-5` ≈ 20px; PDF uses 18). */
export const TICKET_BRAND_LOGO_GAP_PX = 18;
/** Continuous accent bar along the top edge. */
export const TICKET_ACCENT_H_PX = 3;

export type TicketPresentation = {
  ticketId: string;
  ticketNumber: string;
  eventName: string;
  /** Long weekday date, no clock — e.g. „Freitag, 12. Dezember 2026“ */
  dateLabel: string | null;
  /** Event start clock — e.g. „19:00 Uhr“ */
  startLabel: string | null;
  doors: ResolvedTicketDoors;
  locationLines: string[];
  locationShort: string;
  /** Venue (+ city) without street — for ticket face / PDF */
  locationTicket: string;
  /** Venue name only (line 1) */
  locationName: string;
  /** City / address line under venue name (line 2) */
  locationDetail: string | null;
  categoryName: string;
  categoryKind: string | null;
  isVip: boolean;
  /** Row/seat or Stehplatz / Freie Platzwahl */
  placeLabel: string;
  /** Prominent print line: BLOCK A · REIHE 1 · PLATZ 9 / FREIE PLATZWAHL / Stehplatz */
  placeDisplayLabel: string;
  /** True when placeDisplayLabel is a concrete seat assignment */
  hasAssignedSeat: boolean;
  priceLabel: string | null;
  coverUrl: string | null;
  /** Absolute URL for print/PDF embedding */
  coverAbsoluteUrl: string | null;
  /** Optional sponsor logo above admit label (relative or absolute) */
  sponsorLogoAboveUrl: string | null;
  sponsorLogoAboveAbsoluteUrl: string | null;
  /** Display scale 0.45–1 relative to max stub box */
  sponsorLogoAboveScale: number;
  /** Optional sponsor logo below QR hint */
  sponsorLogoBelowUrl: string | null;
  sponsorLogoBelowAbsoluteUrl: string | null;
  sponsorLogoBelowScale: number;
  /**
   * Optional sponsor metadata stubs (not rendered yet).
   * Reserved so category-level name/URL can plug in without a layout rewrite.
   */
  sponsorAboveName: string | null;
  sponsorAboveHref: string | null;
  sponsorBelowName: string | null;
  sponsorBelowHref: string | null;
  organizerDisplayName: string;
  organizerAddress: string;
  organizerContact: string | null;
  holderName: string | null;
  orderNumber: string;
  qrToken: string | null;
};

export function isVipCategory(
  categoryName: string | null | undefined,
  categoryKind: string | null | undefined,
): boolean {
  if ((categoryKind ?? "").toLowerCase() === "vip") return true;
  const name = (categoryName ?? "").toLowerCase();
  return /\bvip\b/.test(name);
}

/** Human place line: seat label, else category-kind fallback. */
export function resolvePlaceLabel(input: {
  seatLabel?: string | null;
  categoryKind?: string | null;
  freeSeating?: boolean | null;
}): string {
  const seat = input.seatLabel?.trim();
  if (seat) return seat;
  const kind = (input.categoryKind ?? "").toLowerCase();
  if (kind === "standing") return "Stehplatz";
  if (kind === "free_choice" || input.freeSeating) return "Freie Platzwahl";
  return "Freie Platzwahl";
}

/**
 * Print/PDF seat hierarchy: assigned seats uppercase; free seating all-caps;
 * plain standing title-case.
 */
export function formatProminentPlaceLabel(placeLabel: string): {
  label: string;
  hasAssignedSeat: boolean;
} {
  const raw = placeLabel.trim();
  if (!raw) return { label: "FREIE PLATZWAHL", hasAssignedSeat: false };
  const lower = raw.toLowerCase();
  if (lower === "freie platzwahl") {
    return { label: "FREIE PLATZWAHL", hasAssignedSeat: false };
  }
  if (lower === "stehplatz") {
    return { label: "Stehplatz", hasAssignedSeat: false };
  }
  // Assigned seat / standing unit with block — emphasize as ticket strip line
  if (/reihe|platz|block|stehplatz/i.test(raw) || raw.includes("·")) {
    return { label: raw.toUpperCase(), hasAssignedSeat: true };
  }
  return { label: raw, hasAssignedSeat: false };
}

export type SeatHighlightPart = { label: string; value: string };

/**
 * Split „BLOCK A · REIHE 1 · PLATZ 9“ into highlight boxes; free/standing stay as text.
 */
export function parseSeatHighlight(
  placeDisplayLabel: string,
  hasAssignedSeat: boolean,
): { mode: "boxes" | "text"; parts: SeatHighlightPart[]; text: string } {
  const text = placeDisplayLabel.trim() || "FREIE PLATZWAHL";
  if (!hasAssignedSeat) {
    return { mode: "text", parts: [], text };
  }
  const parts = text
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^([A-Za-zÄÖÜäöüß]+)\s+(.+)$/u);
      if (m) return { label: m[1]!.toUpperCase(), value: m[2]! };
      return { label: "", value: seg };
    });
  if (parts.length === 0) return { mode: "text", parts: [], text };
  return { mode: "boxes", parts, text };
}

type SponsorLogoSource = {
  ticketSponsorLogoAboveUrl?: string | null;
  ticketSponsorLogoBelowUrl?: string | null;
  ticketSponsorLogoAboveScale?: number | null;
  ticketSponsorLogoBelowScale?: number | null;
};

/**
 * Event-level sponsor logos today. Category overrides are reserved for later
 * (pass category logos when that UI exists — category wins over event).
 */
export function resolveTicketSponsorLogos(
  event: SponsorLogoSource,
  category?: SponsorLogoSource | null,
): {
  aboveUrl: string | null;
  belowUrl: string | null;
  aboveScale: number;
  belowScale: number;
} {
  const above =
    category?.ticketSponsorLogoAboveUrl?.trim() ||
    event.ticketSponsorLogoAboveUrl?.trim() ||
    null;
  const below =
    category?.ticketSponsorLogoBelowUrl?.trim() ||
    event.ticketSponsorLogoBelowUrl?.trim() ||
    null;
  const aboveScale = clampSponsorLogoScale(
    category?.ticketSponsorLogoAboveScale ?? event.ticketSponsorLogoAboveScale ?? 1,
  );
  const belowScale = clampSponsorLogoScale(
    category?.ticketSponsorLogoBelowScale ?? event.ticketSponsorLogoBelowScale ?? 1,
  );
  return { aboveUrl: above, belowUrl: below, aboveScale, belowScale };
}
