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

const PLATFORM_BRAND_RE = /^ticketfeeling$/i;

/** Public Veranstalter label: "Peter Loder (SCHLAGERfeeling)" — never the platform brand. */
export function formatOrganizerDisplayName(person: string | null | undefined, brand: string | null | undefined) {
  const p = person?.trim() || "";
  const b = brand?.trim() || "";
  if (p && b && p !== b) {
    if (p.includes("(")) return p;
    return `${p} (${b})`;
  }
  return p || b || "Veranstalter";
}

/** Prefer brandName; never surface Ticketfeeling as Veranstalter brand. */
export function resolveOrganizerBrandName(identity: Pick<SellerIdentity, "brandName" | "tradeName">) {
  const brand = identity.brandName?.trim() || "";
  if (brand && !PLATFORM_BRAND_RE.test(brand)) return brand;
  const trade = identity.tradeName?.trim() || "";
  if (trade && !PLATFORM_BRAND_RE.test(trade)) return trade;
  return "SCHLAGERfeeling";
}

/**
 * Veranstalter for tickets / event page: OrganizationSettings as default,
 * with optional per-event overrides. Ticketfeeling is never the Veranstalter.
 */
export function buildEventOrganizerIdentity(
  org: Pick<Organization, "id" | "name" | "slug">,
  settings: OrganizationSettings | null | undefined,
  event?: EventOrganizerFields | null,
): SellerIdentity {
  // Event pages select a slim org; seller identity only needs name (+ settings).
  const base = buildSellerIdentity(org as Organization, settings);
  const defaultBrand = resolveOrganizerBrandName(base);
  const defaultDisplay = formatOrganizerDisplayName(base.legalPersonName, defaultBrand);

  if (!event) {
    return { ...base, brandName: defaultBrand, displayName: defaultDisplay };
  }

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
  if (!hasOverride) {
    return { ...base, brandName: defaultBrand, displayName: defaultDisplay };
  }

  const legalPersonName = contact || name || base.legalPersonName;
  const tradeName =
    name && !PLATFORM_BRAND_RE.test(name) ? name : defaultBrand;
  const brandName = tradeName;
  const displayName =
    name && contact && name !== contact
      ? formatOrganizerDisplayName(contact, name)
      : name
        ? name
        : contact
          ? formatOrganizerDisplayName(contact, defaultBrand)
          : defaultDisplay;

  return {
    ...base,
    legalPersonName,
    tradeName,
    displayName,
    brandName,
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
