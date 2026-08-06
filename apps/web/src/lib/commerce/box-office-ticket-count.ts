/**
 * Ticket count for Tageskasse sales list / Beleg subtitle.
 *
 * Prefer real ticket rows (non-voided). If fulfillment never minted tickets
 * for a live paid sale, fall back to sold positions so the list does not show
 * „0 Tickets“ next to paid line items.
 */
export function countBoxOfficeSaleTickets(order: {
  tickets: { status: string }[];
  items: { quantity: number }[];
  voidedAt?: Date | string | null;
  status?: string | null;
}): number {
  const activeFromTickets = order.tickets.filter((t) => t.status !== "voided").length;
  if (order.tickets.length > 0) return activeFromTickets;

  if (
    order.voidedAt ||
    order.status === "cancelled" ||
    order.status === "refunded"
  ) {
    return 0;
  }

  return order.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
}
