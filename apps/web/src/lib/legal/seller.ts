import type { Organization, OrganizationSettings } from "@prisma/client";
import {
  type CompanyAddress,
  DEFAULT_LEGAL_PERSON_LINE,
  countryLabelDe,
  formatCompanyAddressBlock,
  formatCompanyAddressLine,
  resolveBillingCompanyAddress,
  resolvePublicCompanyAddress,
} from "@/lib/legal/company-address";

export type SellerIdentity = {
  legalPersonName: string;
  tradeName: string;
  displayName: string;
  brandName: string;
  /** "Peter Loder (Einzelunternehmen)" when legal form is set */
  legalPersonLine: string;
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
  /** public | billing — which address this identity carries */
  addressKind: "public" | "billing";
};

export type SellerAddressKind = "public" | "billing";

function identityBase(
  org: Organization,
  settings: OrganizationSettings | null | undefined,
) {
  const data = (settings?.data ?? {}) as Record<string, unknown>;
  const legalPersonName =
    (typeof data.legalPersonName === "string" && data.legalPersonName) ||
    settings?.legalName ||
    "Peter Loder";
  const tradeName =
    (typeof data.tradeName === "string" && data.tradeName) || org.name || "Ticketfeeling";
  const brandName =
    (typeof data.brandName === "string" && data.brandName) || "SCHLAGERfeeling";
  const legalForm = settings?.legalForm?.trim() || "Einzelunternehmen";
  const legalPersonLine =
    legalForm && !legalPersonName.includes("(")
      ? `${legalPersonName} (${legalForm})`
      : legalPersonName || DEFAULT_LEGAL_PERSON_LINE;

  return {
    legalPersonName,
    tradeName,
    displayName: `${legalPersonName} – ${tradeName}`,
    brandName,
    legalPersonLine,
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

function withAddress(
  base: ReturnType<typeof identityBase>,
  address: CompanyAddress,
  addressKind: SellerAddressKind,
): SellerIdentity {
  return {
    ...base,
    street: address.street,
    houseNumber: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    country: address.country,
    addressKind,
  };
}

/** Public-facing seller (Impressum, checkout, site). Landshut — never Konradinstr.
 *  Not for transactional email footers — those omit the street address. */
export function buildSellerIdentity(
  org: Organization,
  settings: OrganizationSettings | null | undefined,
): SellerIdentity {
  return withAddress(
    identityBase(org, settings),
    resolvePublicCompanyAddress(settings),
    "public",
  );
}

/** Billing / tax seller (invoice PDFs, accounting docs). Altdorf / Konradinstr. */
export function buildBillingSellerIdentity(
  org: Organization,
  settings: OrganizationSettings | null | undefined,
): SellerIdentity {
  return withAddress(
    identityBase(org, settings),
    resolveBillingCompanyAddress(settings),
    "billing",
  );
}

export function formatSellerAddress(seller: Pick<SellerIdentity, "street" | "houseNumber" | "postalCode" | "city">) {
  return formatCompanyAddressLine({
    street: seller.street,
    houseNumber: seller.houseNumber,
    postalCode: seller.postalCode,
    city: seller.city,
    country: "DE",
  });
}

/** Multiline address block including legal person line and country. */
export function formatSellerAddressBlock(seller: SellerIdentity) {
  return formatCompanyAddressBlock(
    {
      street: seller.street,
      houseNumber: seller.houseNumber,
      postalCode: seller.postalCode,
      city: seller.city,
      country: seller.country,
    },
    { legalPersonLine: seller.legalPersonLine },
  );
}

export function formatSellerCountry(seller: Pick<SellerIdentity, "country">) {
  return countryLabelDe(seller.country);
}

/** Snapshot payload for orders (public) or invoices (billing). */
export function sellerSnapshotPayload(
  seller: SellerIdentity,
  role: "seller" | "organizer" = "seller",
) {
  return {
    ...seller,
    addressLine: formatSellerAddress(seller),
    addressBlock: formatSellerAddressBlock(seller),
    countryLabel: formatSellerCountry(seller),
    role,
  };
}
