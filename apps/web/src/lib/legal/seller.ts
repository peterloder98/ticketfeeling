import type { Organization, OrganizationSettings } from "@prisma/client";

export type SellerIdentity = {
  legalPersonName: string;
  tradeName: string;
  displayName: string;
  brandName: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  email: string | null;
  supportEmail: string | null;
  phone: string | null;
  homepage: string | null;
  ticketShopDomain: string | null;
  vatId: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  responsiblePerson: string;
};

export function buildSellerIdentity(
  org: Organization,
  settings: OrganizationSettings | null | undefined,
): SellerIdentity {
  const data = (settings?.data ?? {}) as Record<string, unknown>;
  const legalPersonName =
    (typeof data.legalPersonName === "string" && data.legalPersonName) ||
    settings?.legalName ||
    "Peter Loder";
  const tradeName =
    (typeof data.tradeName === "string" && data.tradeName) || org.name || "Ticketfeeling";
  const brandName =
    (typeof data.brandName === "string" && data.brandName) || "SCHLAGERfeeling";

  return {
    legalPersonName,
    tradeName,
    displayName: `${legalPersonName} – ${tradeName}`,
    brandName,
    street: settings?.street ?? "Innere Münchener Str.",
    houseNumber: settings?.houseNumber ?? "36",
    postalCode: settings?.postalCode ?? "84028",
    city: settings?.city ?? "Landshut",
    country: settings?.country ?? "DE",
    email: settings?.email ?? null,
    supportEmail: settings?.supportEmail ?? null,
    phone: settings?.phone ?? null,
    homepage: settings?.homepage ?? null,
    ticketShopDomain: settings?.ticketShopDomain ?? null,
    vatId: settings?.vatId ?? null,
    taxNumber: settings?.taxNumber ?? null,
    taxOffice: typeof data.taxOffice === "string" ? data.taxOffice : null,
    responsiblePerson: legalPersonName,
  };
}

export function formatSellerAddress(seller: SellerIdentity) {
  return `${seller.street} ${seller.houseNumber}, ${seller.postalCode} ${seller.city}`;
}
