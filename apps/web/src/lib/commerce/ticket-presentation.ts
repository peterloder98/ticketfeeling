import { prisma } from "@/lib/db";
import { formatDeDateTime, formatDeTime } from "@/lib/datetime-de";
import { formatSellerAddress } from "@/lib/legal/seller";
import { buildEventOrganizerIdentity } from "@/lib/legal/event-organizer";
import { resolveTicketDoors, type ResolvedTicketDoors } from "@/lib/commerce/ticket-doors";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { formatEuroFromCents } from "@/lib/money";
import { getPublicAppUrl } from "@/lib/embed/public-url";

export const TF_NAVY = "#0F2747";
export const TF_TEAL = "#14B8A6";
export const TF_GOLD = "#D6A642";
export const TF_MUTED = "#64748B";
export const TF_INK = "#0B1421";
export const TF_LINE = "#E5E7EB";
export const TF_PAPER = "#FFFFFF";
export const TF_SOFT = "#F8FAFC";
export const TF_TAGLINE = "Mehr als ein Ticket";
export const TF_PRINT_HINT =
  "Am Einlass auf dem Smartphone vorzeigen oder ausdrucken.";
export const TF_QR_HINT = "Am Einlass vorzeigen.";

/**
 * Print@Home ticket BODY (not the A4 sheet): landscape ~2:1, e.g. 200×100 mm.
 * Lock this ratio in HTML/CSS and PDF — never let A4 height stretch the ticket.
 */
export const TICKET_BODY_ASPECT = 2;
/** Cover | info | QR column fractions (must sum ≤ 100). */
export const TICKET_COL_COVER = 0.33;
export const TICKET_COL_QR = 0.25;

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
  organizerDisplayName: string;
  organizerAddress: string;
  organizerContact: string | null;
  holderName: string | null;
  orderNumber: string;
  qrToken: string | null;
};

function formatDateLong(date: Date | null | undefined): string | null {
  if (!date) return null;
  return formatDeDateTime(date, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function locationLines(location: {
  name: string;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
} | null): string[] {
  if (!location) return ["—"];
  const street = [location.street, location.houseNumber].filter(Boolean).join(" ");
  const city = [location.postalCode, location.city].filter(Boolean).join(" ");
  return [location.name, street, city].filter(Boolean) as string[];
}

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

function locationTicketLine(lines: string[]): string {
  const name = lines[0]?.trim();
  const city = lines[2]?.trim(); // street is [1]
  if (name && city) return `${name}, ${city}`;
  if (name) return name;
  return lines.filter(Boolean).join(", ") || "—";
}

function toAbsoluteAssetUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${getPublicAppUrl()}${url}`;
  return url;
}

export async function loadTicketPresentation(
  ticketId: string,
): Promise<TicketPresentation> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { location: true, tour: { select: { coverImageUrl: true } } } },
      category: true,
      holder: true,
      qrTokens: { where: { status: "active" }, take: 1 },
      organization: { include: { settings: true } },
      order: true,
      orderItem: true,
    },
  });
  if (!ticket) throw new Error("TICKET_NOT_FOUND");

  const organizer = buildEventOrganizerIdentity(
    ticket.organization,
    ticket.organization.settings,
    ticket.event,
  );
  const doors = resolveTicketDoors(ticket.event, ticket.category);
  const coverUrl = resolveEventCoverUrl(ticket.event);
  const lines = locationLines(ticket.event.location);
  const categoryName = ticket.categorySnapshot;
  const categoryKind = ticket.category?.categoryKind ?? null;
  const isVip = isVipCategory(categoryName, categoryKind);
  const unitCents = ticket.orderItem?.unitPaidGrossCents;
  const priceLabel =
    typeof unitCents === "number" && unitCents >= 0
      ? formatEuroFromCents(unitCents, ticket.order.currency || "EUR")
      : null;
  const placeLabel = resolvePlaceLabel({
    seatLabel: ticket.seatLabel,
    categoryKind,
    freeSeating: ticket.category?.freeSeating,
  });
  const place = formatProminentPlaceLabel(placeLabel);

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    eventName: ticket.eventNameSnapshot,
    dateLabel: formatDateLong(ticket.event.eventStartsAt),
    startLabel: ticket.event.eventStartsAt
      ? formatDeTime(ticket.event.eventStartsAt)
      : null,
    doors,
    locationLines: lines,
    locationShort: lines.filter(Boolean).join(", ") || "—",
    locationTicket: locationTicketLine(lines),
    categoryName,
    categoryKind,
    isVip,
    placeLabel,
    placeDisplayLabel: place.label,
    hasAssignedSeat: place.hasAssignedSeat,
    priceLabel,
    coverUrl,
    coverAbsoluteUrl: toAbsoluteAssetUrl(coverUrl),
    organizerDisplayName: organizer.displayName,
    organizerAddress: formatSellerAddress(organizer),
    organizerContact: organizer.supportEmail ?? organizer.email ?? null,
    holderName:
      `${ticket.holder?.firstName ?? ""} ${ticket.holder?.lastName ?? ""}`.trim() ||
      null,
    orderNumber: ticket.order.orderNumber,
    qrToken: ticket.qrTokens[0]?.token ?? null,
  };
}
