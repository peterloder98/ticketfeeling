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
 * Public listing / “ab”-price: customer total including Verwaltungsgebühr.
 * Seat/category pickers that show ticket-only units keep using formatFeeSurchargeNote.
 */
export function formatCustomerPriceLabel(input: {
  ticketGrossCents: number;
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints" | "displayName">;
  formatEuro: (cents: number) => string;
  prefix?: "ab" | null;
}): {
  totalLabel: string;
  surchargeLabel: string;
  breakdownLabel: string;
  ticketCents: number;
  totalCents: number;
  feeCents: number;
} {
  const ticketCents = Math.max(0, input.ticketGrossCents);
  const feeCents = customerUnitFeeCents(ticketCents, input.feeConfig);
  const totalCents = ticketCents + feeCents;
  const prefix = input.prefix === "ab" ? "ab " : "";
  const totalLabel = `${prefix}${input.formatEuro(totalCents)}`;
  const surchargeLabel = formatFeeIncludedNote(input.feeConfig);

  return {
    ticketCents,
    totalCents,
    feeCents,
    totalLabel,
    surchargeLabel,
    breakdownLabel: surchargeLabel,
  };
}
