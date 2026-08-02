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

/** Small surcharge note for listing / ticket UIs (not cart totals). */
export function formatFeeSurchargeNote(
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints" | "displayName">,
): string {
  if (!feeConfig.enabled || feeConfig.percentageBasisPoints <= 0) return "";
  return `zzgl. ${formatFeePercentageLabel(feeConfig.percentageBasisPoints)} ${feeConfig.displayName}`;
}

/**
 * Public listing / event price: ticket amount without fee as main label,
 * plus small “zzgl. X % Verwaltungsgebühr”. Cart/checkout show the full total.
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
  const totalLabel = `${prefix}${input.formatEuro(ticketCents)}`;
  const surchargeLabel = formatFeeSurchargeNote(input.feeConfig);

  return {
    ticketCents,
    totalCents,
    feeCents,
    totalLabel,
    surchargeLabel,
    breakdownLabel: surchargeLabel,
  };
}
