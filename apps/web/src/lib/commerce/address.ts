import { z } from "zod";

/** German UI copy when a street name contains digits. */
export const STREET_NO_NUMBERS_MESSAGE =
  "In der Straße dürfen keine Zahlen stehen — die Hausnummer gehört ins eigene Feld.";

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
