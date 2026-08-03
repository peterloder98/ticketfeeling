import { z } from "zod";

/** German UI copy when a street name contains digits. */
export const STREET_NO_NUMBERS_MESSAGE =
  "In der Straße dürfen keine Zahlen stehen — die Hausnummer gehört ins eigene Feld.";

/** German UI copy when a postal code contains letters or symbols. */
export const POSTAL_CODE_DIGITS_ONLY_MESSAGE =
  "Die PLZ darf nur Ziffern enthalten — bitte 5-stellige Postleitzahl eingeben.";

/** True when the street name contains any digit (0–9). */
export function streetContainsDigits(value: string): boolean {
  return /[0-9]/.test(value);
}

/**
 * Strip digits from a street name while typing.
 * Keeps letters (incl. accents), spaces, hyphens, periods, apostrophes.
 */
export function filterStreetNameInput(raw: string): string {
  return raw.replace(/[0-9]/g, "");
}

/** True when the postal code contains anything other than digits. */
export function postalCodeContainsNonDigits(value: string): boolean {
  return /[^\d]/.test(value);
}

/**
 * Keep digits only for PLZ (DE standard, max 5).
 */
export function filterPostalCodeInput(raw: string, maxLength = 5): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

/** Zod: non-empty street name without digits. */
export const streetNameSchema = z
  .string()
  .trim()
  .min(1, "STREET_REQUIRED")
  .refine((v) => !streetContainsDigits(v), { message: "STREET_NO_NUMBERS" });

/** Optional street (empty/undefined ok); if present, no digits. */
export const optionalStreetNameSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .refine((v) => !v || !streetContainsDigits(v), { message: "STREET_NO_NUMBERS" });

/** Required DE postal code: exactly 5 digits. */
export const germanPostalCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "POSTAL_CODE_INVALID");

/**
 * Optional postal code: empty/undefined ok; if present, digits only (4–5 for DE/AT/CH).
 */
export const optionalPostalCodeSchema = z
  .string()
  .trim()
  .max(5)
  .optional()
  .refine((v) => !v || /^\d{4,5}$/.test(v), { message: "POSTAL_CODE_INVALID" });
