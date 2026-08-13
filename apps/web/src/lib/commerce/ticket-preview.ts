/**
 * Admin Ticketvorschau — fictional face from current event setup (no real ticket/order).
 * QR payload is never minted into ticket_qr_tokens → scanner always INVALID.
 */

import { formatDeDateTime, formatDeTime } from "@/lib/datetime-de";
import { formatEuroFromCents } from "@/lib/money";
import { resolveTicketCoverUrl } from "@/lib/commerce/event-cover";
import { resolveTicketDoors } from "@/lib/commerce/ticket-doors";
import {
  formatLocationCityLine,
  formatLocationStreetLine,
} from "@/lib/commerce/location-display";
import {
  formatProminentPlaceLabel,
  isVipCategory,
  resolvePlaceLabel,
  resolveTicketSponsorLogos,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation-shared";

/** Encoded in the preview QR — must never exist in ticket_qr_tokens. */
export const TICKET_PREVIEW_QR_PAYLOAD = "TF-PREVIEW-INVALID";
export const TICKET_PREVIEW_ORDER_NUMBER = "TF-B-PREVIEW";
export const TICKET_PREVIEW_TICKET_NUMBER = "TF-T-PREVIEW";
export const TICKET_PREVIEW_HOLDER_NAME = "Max Mustermann";

export type TicketPreviewEventInput = {
  name: string;
  eventStartsAt?: Date | null;
  doorsOpenAt?: Date | null;
  ticketHeroImageUrl?: string | null;
  coverImageUrl?: string | null;
  tour?: { coverImageUrl?: string | null } | null;
  ticketSponsorLogoAboveUrl?: string | null;
  ticketSponsorLogoBelowUrl?: string | null;
  ticketSponsorLogoAboveScale?: number | null;
  ticketSponsorLogoBelowScale?: number | null;
  organizerName?: string | null;
  location?: {
    name?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
  } | null;
};

export type TicketPreviewCategoryInput = {
  name: string;
  categoryKind?: string | null;
  freeSeating?: boolean | null;
  extrasShortText?: string | null;
  doorsOpenAt?: Date | null;
  doorsNote?: string | null;
  priceGrossCents?: number | null;
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

function locationLines(location: TicketPreviewEventInput["location"]): string[] {
  if (!location?.name?.trim() && !location?.city?.trim()) return ["Ort noch offen"];
  const street = formatLocationStreetLine(location ?? {});
  const city = formatLocationCityLine(location ?? {});
  const name = location?.name?.trim() || "Ort noch offen";
  return [name, street, city].filter(Boolean) as string[];
}

function locationTicketLine(lines: string[]): string {
  const name = lines[0]?.trim();
  const city = lines[2]?.trim();
  if (name && city) return `${name}, ${city}`;
  if (name) return name;
  return lines.filter(Boolean).join(", ") || "Ort noch offen";
}

/**
 * Build a TicketPresentation for admin layout preview.
 * Uses real event graphics/meta; buyer/order/QR are fictional and non-redeemable.
 */
export function buildEventTicketPreviewPresentation(input: {
  event: TicketPreviewEventInput;
  category?: TicketPreviewCategoryInput | null;
}): TicketPresentation {
  const { event } = input;
  const category: TicketPreviewCategoryInput = input.category ?? {
    name: "Beispielkategorie",
    categoryKind: "standard",
    freeSeating: true,
    priceGrossCents: 0,
  };

  const categoryName = category.name.trim() || "Beispielkategorie";
  const categoryKind = category.categoryKind ?? null;
  const isVip = isVipCategory(categoryName, categoryKind);
  const doors = resolveTicketDoors(
    { doorsOpenAt: event.doorsOpenAt ?? null },
    {
      name: categoryName,
      doorsOpenAt: category.doorsOpenAt ?? null,
      doorsNote: category.doorsNote ?? null,
    },
  );
  const lines = locationLines(event.location);
  const coverUrl = resolveTicketCoverUrl(event);
  const sponsors = resolveTicketSponsorLogos(event);
  const placeLabel = resolvePlaceLabel({
    seatLabel: isVip
      ? "VIP-Bereich · Freie Platzwahl"
      : categoryKind === "standing"
        ? null
        : category.freeSeating
          ? null
          : "Block A · Reihe 1 · Platz 12",
    categoryKind,
    freeSeating: category.freeSeating,
  });
  const place = formatProminentPlaceLabel(placeLabel);
  const priceCents =
    typeof category.priceGrossCents === "number" && category.priceGrossCents >= 0
      ? category.priceGrossCents
      : null;

  return {
    ticketId: "preview",
    ticketNumber: TICKET_PREVIEW_TICKET_NUMBER,
    eventName: event.name.trim() || "Event (Vorschau)",
    dateLabel: formatDateLong(event.eventStartsAt) ?? "Datum noch offen",
    startLabel: event.eventStartsAt ? formatDeTime(event.eventStartsAt) : null,
    doors,
    locationLines: lines,
    locationShort: lines.filter(Boolean).join(", ") || "Ort noch offen",
    locationTicket: locationTicketLine(lines),
    locationName: lines[0]?.trim() || "Ort noch offen",
    locationDetail: lines[2]?.trim() || lines[1]?.trim() || null,
    categoryName,
    categoryKind,
    isVip,
    extrasShortText: isVip ? category.extrasShortText?.trim() || null : null,
    placeLabel,
    placeDisplayLabel: place.label,
    hasAssignedSeat: place.hasAssignedSeat,
    priceLabel:
      priceCents != null ? formatEuroFromCents(priceCents, "EUR") : null,
    coverUrl,
    coverAbsoluteUrl: coverUrl,
    sponsorLogoAboveUrl: sponsors.aboveUrl,
    sponsorLogoAboveAbsoluteUrl: sponsors.aboveUrl,
    sponsorLogoAboveScale: sponsors.aboveScale,
    sponsorLogoBelowUrl: sponsors.belowUrl,
    sponsorLogoBelowAbsoluteUrl: sponsors.belowUrl,
    sponsorLogoBelowScale: sponsors.belowScale,
    sponsorAboveName: null,
    sponsorAboveHref: null,
    sponsorBelowName: null,
    sponsorBelowHref: null,
    organizerDisplayName: event.organizerName?.trim() || "Veranstalter",
    organizerAddress: "",
    organizerContact: null,
    holderName: TICKET_PREVIEW_HOLDER_NAME,
    orderNumber: TICKET_PREVIEW_ORDER_NUMBER,
    qrToken: TICKET_PREVIEW_QR_PAYLOAD,
  };
}

export function pickTicketPreviewCategories<
  T extends {
    name: string;
    categoryKind?: string | null;
  },
>(categories: T[]): { standard: T | null; vip: T | null } {
  const vip =
    categories.find((c) => isVipCategory(c.name, c.categoryKind ?? null)) ?? null;
  const standard =
    categories.find((c) => !isVipCategory(c.name, c.categoryKind ?? null)) ??
    null;
  return { standard, vip };
}
