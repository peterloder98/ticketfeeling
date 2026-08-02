/** Synthetic walk-up emails from Tageskasse without a real address. */
export function isWalkInCustomerEmail(email: string | null | undefined): boolean {
  return Boolean(email?.includes("@ticketfeeling.local"));
}

export function customerDisplayEmail(email: string): string | null {
  return isWalkInCustomerEmail(email) ? null : email;
}

export function isOrderCountedInRevenue(input: {
  status: string;
  voidedAt?: Date | string | null;
}): boolean {
  if (input.voidedAt) return false;
  if (input.status === "cancelled" || input.status === "refunded") return false;
  return input.status === "paid" || input.status === "fulfilled";
}
