import { prisma } from "@/lib/db";
import { formatDeDateTime, formatDeTime } from "@/lib/datetime-de";
import { formatSellerAddress } from "@/lib/legal/seller";
import { buildEventOrganizerIdentity } from "@/lib/legal/event-organizer";
import { resolveTicketDoors } from "@/lib/commerce/ticket-doors";
import { resolveTicketCoverUrl } from "@/lib/commerce/event-cover";
import { ensureTicketHeroImageColumn } from "@/lib/commerce/ensure-ticket-hero";
import { ensureTicketSponsorLogoColumns } from "@/lib/commerce/ensure-ticket-sponsor-logos";
import { formatEuroFromCents } from "@/lib/money";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import {
  formatProminentPlaceLabel,
  isVipCategory,
  resolvePlaceLabel,
  resolveTicketSponsorLogos,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation-shared";

export type { TicketPresentation, SeatHighlightPart } from "@/lib/commerce/ticket-presentation-shared";
export {
  TF_NAVY,
  TF_TEAL,
  TF_GOLD,
  TF_MUTED,
  TF_INK,
  TF_LINE,
  TF_PAPER,
  TF_SOFT,
  TF_TAGLINE,
  TF_PRINT_HINT,
  TF_QR_HINT,
  TICKET_SPONSOR_LOGO_MAX_H_PX,
  TICKET_SPONSOR_LOGO_MAX_W_PX,
  SPONSOR_LOGO_SCALE_MIN,
  SPONSOR_LOGO_SCALE_MAX,
  TICKET_QR_MIN_PX,
  clampSponsorLogoScale,
  sponsorLogoBoxForScale,
  TICKET_BODY_ASPECT,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  isVipCategory,
  resolvePlaceLabel,
  formatProminentPlaceLabel,
  parseSeatHighlight,
  resolveTicketSponsorLogos,
} from "@/lib/commerce/ticket-presentation-shared";

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

function locationTicketLine(lines: string[]): string {
  const name = lines[0]?.trim();
  const city = lines[2]?.trim(); // street is [1]
  if (name && city) return `${name}, ${city}`;
  if (name) return name;
  return lines.filter(Boolean).join(", ") || "—";
}

function locationNameLine(lines: string[]): string {
  return lines[0]?.trim() || "—";
}

/** City preferred; else street — never dump full organizer address. */
function locationDetailLine(lines: string[]): string | null {
  const city = lines[2]?.trim();
  if (city) return city;
  const street = lines[1]?.trim();
  return street || null;
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
  await Promise.all([
    ensureTicketHeroImageColumn(),
    ensureTicketSponsorLogoColumns(),
  ]);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: {
        include: {
          location: true,
          tour: { select: { coverImageUrl: true } },
        },
      },
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
  const coverUrl = resolveTicketCoverUrl(ticket.event);
  const sponsors = resolveTicketSponsorLogos(ticket.event);
  const sponsorAbove = sponsors.aboveUrl;
  const sponsorBelow = sponsors.belowUrl;
  const sponsorAboveScale = sponsors.aboveScale;
  const sponsorBelowScale = sponsors.belowScale;
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
    locationName: locationNameLine(lines),
    locationDetail: locationDetailLine(lines),
    categoryName,
    categoryKind,
    isVip,
    placeLabel,
    placeDisplayLabel: place.label,
    hasAssignedSeat: place.hasAssignedSeat,
    priceLabel,
    coverUrl,
    coverAbsoluteUrl: toAbsoluteAssetUrl(coverUrl),
    sponsorLogoAboveUrl: sponsorAbove,
    sponsorLogoAboveAbsoluteUrl: toAbsoluteAssetUrl(sponsorAbove),
    sponsorLogoAboveScale: sponsorAboveScale,
    sponsorLogoBelowUrl: sponsorBelow,
    sponsorLogoBelowAbsoluteUrl: toAbsoluteAssetUrl(sponsorBelow),
    sponsorLogoBelowScale: sponsorBelowScale,
    sponsorAboveName: null,
    sponsorAboveHref: null,
    sponsorBelowName: null,
    sponsorBelowHref: null,
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
