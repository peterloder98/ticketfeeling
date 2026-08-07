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
export const TF_TAGLINE = "Ticketfeeling · Mehr als ein Ticket";

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
  categoryName: string;
  categoryKind: string | null;
  isVip: boolean;
  /** Row/seat or Stehplatz / Freie Platzwahl */
  placeLabel: string;
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
    categoryName,
    categoryKind,
    isVip,
    placeLabel: resolvePlaceLabel({
      seatLabel: ticket.seatLabel,
      categoryKind,
      freeSeating: ticket.category?.freeSeating,
    }),
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
