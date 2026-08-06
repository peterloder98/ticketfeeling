/** Formal German customer address (Sie), from gender + name. */

export type CustomerGender = "female" | "male" | "diverse";

export function isCustomerGender(value: unknown): value is CustomerGender {
  return value === "female" || value === "male" || value === "diverse";
}

export function salutationFromGender(gender: CustomerGender): "frau" | "herr" | "divers" {
  if (gender === "female") return "frau";
  if (gender === "male") return "herr";
  return "divers";
}

/** e.g. "Sehr geehrter Herr Müller" / "Sehr geehrte Frau Müller" / "Guten Tag Anna Müller" */
export function formalGermanGreeting(customer: {
  gender?: string | null;
  /** @deprecated Prefer gender; kept as soft fallback for legacy rows. */
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const last = customer.lastName?.trim() || "";
  const first = customer.firstName?.trim() || "";
  const gender = customer.gender;
  const sal = (customer.salutation ?? "").toLowerCase();

  // Gender is the source of truth for Anrede in emails.
  if (gender === "male") {
    return last ? `Sehr geehrter Herr ${last}` : "Sehr geehrter Herr";
  }
  if (gender === "female") {
    return last ? `Sehr geehrte Frau ${last}` : "Sehr geehrte Frau";
  }
  // Legacy fallback only when gender is missing.
  if (!gender && sal === "herr") {
    return last ? `Sehr geehrter Herr ${last}` : "Sehr geehrter Herr";
  }
  if (!gender && sal === "frau") {
    return last ? `Sehr geehrte Frau ${last}` : "Sehr geehrte Frau";
  }
  if (first && last) return `Guten Tag ${first} ${last}`;
  if (last) return `Guten Tag ${last}`;
  if (first) return `Guten Tag ${first}`;
  return "Guten Tag";
}
