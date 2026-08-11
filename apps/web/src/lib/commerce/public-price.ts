import {
  computePlatformFeeGrossCents,
  type PlatformFeeConfig,
} from "@/lib/commerce/platform-fee";

/** Customer-facing unit total = ticket + Verwaltungsgebühr share for one ticket. */
export function customerUnitPriceCents(
  ticketGrossCents: number,
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints">,
): number {
  const ticket = Math.max(0, ticketGrossCents);
  if (!feeConfig.enabled || ticket === 0) return ticket;
  return ticket + computePlatformFeeGrossCents(ticket, feeConfig.percentageBasisPoints);
}

/**
 * Customer-paid amount for one order line (ticket line + allocated Verwaltungsgebühr).
 * Use for Umsatz / sales reports — never report OrderItem.grossCents alone as revenue.
 */
export function orderItemCustomerPaidCents(
  itemGrossCents: number,
  order: {
    feeGrossCents?: number | null;
    administrationFeeGrossCents?: number | null;
    ticketsGrossCents?: number | null;
    discountCents?: number | null;
  },
): number {
  const ticket = Math.max(0, itemGrossCents);
  const feeGross = Math.max(
    0,
    order.administrationFeeGrossCents || order.feeGrossCents || 0,
  );
  const ticketsPaid = Math.max(
    0,
    (order.ticketsGrossCents || 0) - (order.discountCents || 0),
  );
  if (feeGross <= 0 || ticketsPaid <= 0 || ticket <= 0) return ticket;
  return ticket + Math.round((feeGross * ticket) / ticketsPaid);
}

export function customerUnitFeeCents(
  ticketGrossCents: number,
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints">,
): number {
  const ticket = Math.max(0, ticketGrossCents);
  if (!feeConfig.enabled || ticket === 0) return 0;
  return computePlatformFeeGrossCents(ticket, feeConfig.percentageBasisPoints);
}

export function formatFeePercentageLabel(percentageBasisPoints: number): string {
  const pct = percentageBasisPoints / 100;
  if (!Number.isFinite(pct)) return "0 %";
  if (Number.isInteger(pct)) return `${pct} %`;
  return `${pct.toFixed(2).replace(".", ",").replace(/0+$/, "").replace(/,$/, "")} %`;
}

/** Note when the main amount is ticket-only and fee is added at checkout. */
export function formatFeeSurchargeNote(
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints" | "displayName">,
): string {
  if (!feeConfig.enabled || feeConfig.percentageBasisPoints <= 0) return "";
  return `zzgl. ${formatFeePercentageLabel(feeConfig.percentageBasisPoints)} ${feeConfig.displayName}`;
}

/** Note when the main amount already includes Verwaltungsgebühr. */
export function formatFeeIncludedNote(
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints" | "displayName">,
): string {
  if (!feeConfig.enabled || feeConfig.percentageBasisPoints <= 0) return "";
  return `inkl. ${formatFeePercentageLabel(feeConfig.percentageBasisPoints)} ${feeConfig.displayName}`;
}

/**
 * Public listing / “ab”-price: normal ticket amount (ex fee) + calm „zzgl. …“ note.
 * Checkout / cart keep fee-inclusive clarity separately. Seat pickers that need the
 * percentage in the note still use formatFeeSurchargeNote.
 */
export function formatCustomerPriceLabel(input: {
  ticketGrossCents: number;
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints" | "displayName">;
  formatEuro: (cents: number) => string;
  prefix?: "ab" | null;
}): {
  /** Ticket / from-price label (without Verwaltungsgebühr). */
  totalLabel: string;
  surchargeLabel: string;
  breakdownLabel: string;
  ticketCents: number;
  /** Ticket + fee — for callers that need the checkout total, not the listing label. */
  totalCents: number;
  feeCents: number;
} {
  const ticketCents = Math.max(0, input.ticketGrossCents);
  const feeCents = customerUnitFeeCents(ticketCents, input.feeConfig);
  const totalCents = ticketCents + feeCents;
  const prefix = input.prefix === "ab" ? "ab " : "";
  const totalLabel = `${prefix}${input.formatEuro(ticketCents)}`;
  const surchargeLabel =
    input.feeConfig.enabled && input.feeConfig.percentageBasisPoints > 0
      ? `zzgl. ${input.feeConfig.displayName}`
      : "";

  return {
    ticketCents,
    totalCents,
    feeCents,
    totalLabel,
    surchargeLabel,
    breakdownLabel: surchargeLabel,
  };
}
