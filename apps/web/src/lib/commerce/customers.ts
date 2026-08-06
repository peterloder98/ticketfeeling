/** Synthetic walk-up emails from Tageskasse without a real address. */
export function isWalkInCustomerEmail(email: string | null | undefined): boolean {
  return Boolean(email?.includes("@ticketfeeling.local"));
}

export function customerDisplayEmail(email: string): string | null {
  return isWalkInCustomerEmail(email) ? null : email;
}

/**
 * Anonymous box-office guests (placeholder email and/or default name).
 * These must not clutter the Kunden CRM.
 */
export function isAnonymousBoxOfficeCustomer(customer: {
  email?: string | null;
  emailNormalized?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  const email = customer.emailNormalized || customer.email || "";
  if (isWalkInCustomerEmail(email)) return true;
  const first = (customer.firstName ?? "").trim().toLowerCase();
  const last = (customer.lastName ?? "").trim().toLowerCase();
  return first === "tageskasse" && last === "gast";
}

/** Ticket rows that still count as sold / usable for CRM stats. */
export function isActiveTicketStatus(status: string | null | undefined): boolean {
  return status === "active";
}

export function isOrderCountedInRevenue(input: {
  status: string;
  voidedAt?: Date | string | null;
}): boolean {
  if (input.voidedAt) return false;
  if (input.status === "cancelled" || input.status === "refunded") return false;
  return input.status === "paid" || input.status === "fulfilled";
}
