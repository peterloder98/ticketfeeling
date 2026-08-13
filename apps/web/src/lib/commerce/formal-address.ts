/** Friendly German customer address (Du), from gender + name. */

export type CustomerGender = "female" | "male" | "diverse";

export function isCustomerGender(value: unknown): value is CustomerGender {
  return value === "female" || value === "male" || value === "diverse";
}

export function salutationFromGender(gender: CustomerGender): "frau" | "herr" | "divers" {
  if (gender === "female") return "frau";
  if (gender === "male") return "herr";
  return "divers";
}

/**
 * Personal Ticketfeeling greeting (Du).
 * Prefers first name; falls back to Herr/Frau + Nachname when only last name is known.
 */
export function formalGermanGreeting(customer: {
  gender?: string | null;
  /** @deprecated Prefer gender; kept as soft fallback for legacy rows. */
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const last = customer.lastName?.trim() || "";
  const first = customer.firstName?.trim() || "";
  if (first) return `Hallo ${first}`;

  const gender = customer.gender;
  const sal = (customer.salutation ?? "").toLowerCase();

  if (gender === "male" || (!gender && sal === "herr")) {
    return last ? `Hallo Herr ${last}` : "Hallo";
  }
  if (gender === "female" || (!gender && sal === "frau")) {
    return last ? `Hallo Frau ${last}` : "Hallo";
  }
  if (last) return `Hallo ${last}`;
  return "Hallo";
}
