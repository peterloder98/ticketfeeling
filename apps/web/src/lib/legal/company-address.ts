/**
 * Company addresses for Ticketfeeling / Peter Loder (Einzelunternehmen).
 *
 * Public address → Impressum, Kontakt, Footer, AGB, Datenschutz, Widerruf, cookies,
 * email signatures, website/app/checkout/customer contact. NEVER show Konradinstr. publicly.
 *
 * Billing address → invoice PDFs, invoice headers, credit notes, tax/accounting PDFs only.
 */

export type CompanyAddress = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  /** ISO country code, e.g. DE */
  country: string;
};

export const DEFAULT_PUBLIC_COMPANY_ADDRESS: CompanyAddress = {
  street: "Innere Münchener Str.",
  houseNumber: "36",
  postalCode: "84028",
  city: "Landshut",
  country: "DE",
};

export const DEFAULT_BILLING_COMPANY_ADDRESS: CompanyAddress = {
  street: "Konradinstr.",
  houseNumber: "6",
  postalCode: "84032",
  city: "Altdorf",
  country: "DE",
};

export const DEFAULT_LEGAL_PERSON_LINE = "Peter Loder (Einzelunternehmen)";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseCompanyAddress(
  value: unknown,
  fallback: CompanyAddress,
): CompanyAddress {
  const raw = asRecord(value);
  return {
    street: str(raw.street) ?? fallback.street,
    houseNumber: str(raw.houseNumber) ?? fallback.houseNumber,
    postalCode: str(raw.postalCode) ?? fallback.postalCode,
    city: str(raw.city) ?? fallback.city,
    country: str(raw.country) ?? fallback.country,
  };
}

/** Country label for German legal/UI copy. */
export function countryLabelDe(country: string): string {
  const code = country.trim().toUpperCase();
  if (code === "DE" || code === "DEUTSCHLAND") return "Deutschland";
  return country.trim() || "Deutschland";
}

export function formatCompanyStreetLine(address: CompanyAddress): string {
  return [address.street, address.houseNumber].filter(Boolean).join(" ");
}

export function formatCompanyCityLine(address: CompanyAddress): string {
  return [address.postalCode, address.city].filter(Boolean).join(" ");
}

/** Single-line: "Street 36, 84028 Landshut" */
export function formatCompanyAddressLine(address: CompanyAddress): string {
  return `${formatCompanyStreetLine(address)}, ${formatCompanyCityLine(address)}`;
}

/** Multiline block for legal texts / PDF headers (optional legal person line). */
export function formatCompanyAddressBlock(
  address: CompanyAddress,
  opts?: { legalPersonLine?: string | null },
): string {
  const lines = [
    opts?.legalPersonLine?.trim() || null,
    formatCompanyStreetLine(address),
    formatCompanyCityLine(address),
    countryLabelDe(address.country),
  ].filter(Boolean);
  return lines.join("\n");
}

type SettingsLike = {
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  publicCompanyAddress?: unknown;
  billingCompanyAddress?: unknown;
  data?: unknown;
} | null | undefined;

function fromLegacyStreetFields(settings: SettingsLike): CompanyAddress | null {
  if (!settings?.street?.trim()) return null;
  return {
    street: settings.street.trim(),
    houseNumber: settings.houseNumber?.trim() || DEFAULT_PUBLIC_COMPANY_ADDRESS.houseNumber,
    postalCode: settings.postalCode?.trim() || DEFAULT_PUBLIC_COMPANY_ADDRESS.postalCode,
    city: settings.city?.trim() || DEFAULT_PUBLIC_COMPANY_ADDRESS.city,
    country: settings.country?.trim() || DEFAULT_PUBLIC_COMPANY_ADDRESS.country,
  };
}

/**
 * Public-facing company address. Prefers `publicCompanyAddress` JSON,
 * then legacy street fields, then Ticketfeeling defaults (Landshut).
 */
export function resolvePublicCompanyAddress(settings: SettingsLike): CompanyAddress {
  const data = asRecord(settings?.data);
  const fromColumn = settings?.publicCompanyAddress;
  const fromData = data.publicCompanyAddress;
  if (fromColumn && typeof fromColumn === "object") {
    return parseCompanyAddress(fromColumn, DEFAULT_PUBLIC_COMPANY_ADDRESS);
  }
  if (fromData && typeof fromData === "object") {
    return parseCompanyAddress(fromData, DEFAULT_PUBLIC_COMPANY_ADDRESS);
  }
  return fromLegacyStreetFields(settings) ?? DEFAULT_PUBLIC_COMPANY_ADDRESS;
}

/**
 * Billing / tax address (Konradinstr.). Prefers `billingCompanyAddress` JSON,
 * then `data.billingCompanyAddress`, then defaults — never falls back to public street.
 */
export function resolveBillingCompanyAddress(settings: SettingsLike): CompanyAddress {
  const data = asRecord(settings?.data);
  const fromColumn = settings?.billingCompanyAddress;
  const fromData = data.billingCompanyAddress;
  if (fromColumn && typeof fromColumn === "object") {
    return parseCompanyAddress(fromColumn, DEFAULT_BILLING_COMPANY_ADDRESS);
  }
  if (fromData && typeof fromData === "object") {
    return parseCompanyAddress(fromData, DEFAULT_BILLING_COMPANY_ADDRESS);
  }
  return DEFAULT_BILLING_COMPANY_ADDRESS;
}

export function companyAddressToJson(address: CompanyAddress): CompanyAddress {
  return {
    street: address.street,
    houseNumber: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    country: address.country,
  };
}
