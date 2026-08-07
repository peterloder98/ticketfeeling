import type { Event, Organization, OrganizationSettings } from "@prisma/client";
import {
  buildSellerIdentity,
  formatSellerAddress,
  type SellerIdentity,
} from "@/lib/legal/seller";

export type EventOrganizerFields = {
  organizerName?: string | null;
  organizerContact?: string | null;
  organizerStreet?: string | null;
  organizerHouseNumber?: string | null;
  organizerPostalCode?: string | null;
  organizerCity?: string | null;
  organizerEmail?: string | null;
  organizerPhone?: string | null;
  organizerWebsite?: string | null;
};

/**
 * Veranstalter for tickets: OrganizationSettings (seller identity) as default,
 * with optional per-event overrides. Ticketfeeling is never the Veranstalter.
 */
export function buildEventOrganizerIdentity(
  org: Organization,
  settings: OrganizationSettings | null | undefined,
  event?: EventOrganizerFields | null,
): SellerIdentity {
  const base = buildSellerIdentity(org, settings);
  if (!event) return base;

  const name = event.organizerName?.trim() || null;
  const contact = event.organizerContact?.trim() || null;
  const street = event.organizerStreet?.trim() || null;
  const houseNumber = event.organizerHouseNumber?.trim() || null;
  const postalCode = event.organizerPostalCode?.trim() || null;
  const city = event.organizerCity?.trim() || null;
  const email = event.organizerEmail?.trim() || null;
  const phone = event.organizerPhone?.trim() || null;
  const website = event.organizerWebsite?.trim() || null;

  const hasOverride = Boolean(
    name || contact || street || houseNumber || postalCode || city || email || phone || website,
  );
  if (!hasOverride) return base;

  const legalPersonName = contact || name || base.legalPersonName;
  const tradeName = name || base.tradeName;
  const displayName =
    name && contact && name !== contact
      ? `${contact} – ${name}`
      : name
        ? name
        : contact
          ? `${contact} – ${tradeName}`
          : base.displayName;

  return {
    ...base,
    legalPersonName,
    tradeName,
    displayName,
    brandName: name || base.brandName,
    legalPersonLine: contact
      ? contact.includes("(")
        ? contact
        : `${contact}`
      : base.legalPersonLine,
    street: street ?? base.street,
    houseNumber: houseNumber ?? base.houseNumber,
    postalCode: postalCode ?? base.postalCode,
    city: city ?? base.city,
    email: email ?? base.email,
    supportEmail: email ?? base.supportEmail,
    phone: phone ?? base.phone,
    homepage: website ?? base.homepage,
    responsiblePerson: contact || legalPersonName,
  };
}

export function formatOrganizerFooterLine(organizer: SellerIdentity): string {
  const addr = formatSellerAddress(organizer);
  const parts = [`Veranstalter: ${organizer.displayName}`];
  if (addr) parts.push(addr);
  const mail = organizer.supportEmail ?? organizer.email;
  if (mail) parts.push(mail);
  if (organizer.phone) parts.push(organizer.phone);
  if (organizer.homepage) parts.push(organizer.homepage);
  return parts.join(" · ");
}

/** Snapshot for orders when event overrides exist. */
export function organizerSnapshotFromEvent(
  org: Organization,
  settings: OrganizationSettings | null | undefined,
  event: EventOrganizerFields | null | undefined,
) {
  const organizer = buildEventOrganizerIdentity(org, settings, event);
  return {
    ...organizer,
    addressLine: formatSellerAddress(organizer),
    role: "organizer" as const,
  };
}

export type EventWithOrganizer = Pick<
  Event,
  | "organizerName"
  | "organizerContact"
  | "organizerStreet"
  | "organizerHouseNumber"
  | "organizerPostalCode"
  | "organizerCity"
  | "organizerEmail"
  | "organizerPhone"
  | "organizerWebsite"
>;
