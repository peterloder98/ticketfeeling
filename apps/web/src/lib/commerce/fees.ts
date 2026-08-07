/**
 * @deprecated Legacy Vorverkaufsgebühr — unused. Live fee is Verwaltungsgebühr via
 * `platform-fee.ts` / admin Einstellungen → Preise und Gebühren.
 * Kept only so old imports/types do not break; do not wire new call sites.
 */
import { splitGrossToNetTax } from "@/lib/money";

/** @deprecated use platform-fee Verwaltungsgebühr */
export type PresaleFeeMode = "none" | "fixed_per_ticket" | "percent";

/** @deprecated use PlatformFeeConfig */
export type FeeConfig = {
  mode: PresaleFeeMode;
  fixedCents: number;
  percentBps: number;
  taxRateBps: number;
  source: "organization" | "event";
};

/** @deprecated */
export type FeeComputation = {
  ticketCount: number;
  ticketsGrossCents: number;
  feeGrossCents: number;
  feeNetCents: number;
  feeTaxCents: number;
  totalGrossCents: number;
  config: FeeConfig;
  label: string;
};

/** @deprecated */
export function normalizeFeeMode(value: string | null | undefined): PresaleFeeMode {
  if (value === "fixed_per_ticket" || value === "percent" || value === "none") return value;
  return "none";
}

/** @deprecated */
export function resolveFeeConfig(input: {
  orgMode?: string | null;
  orgFixedCents?: number | null;
  orgPercentBps?: number | null;
  orgTaxBps?: number | null;
  eventMode?: string | null;
  eventFixedCents?: number | null;
  eventPercentBps?: number | null;
}): FeeConfig {
  const useEvent = input.eventMode != null && input.eventMode !== "";
  return {
    mode: normalizeFeeMode(useEvent ? input.eventMode : input.orgMode),
    fixedCents: useEvent
      ? Math.max(0, input.eventFixedCents ?? 0)
      : Math.max(0, input.orgFixedCents ?? 0),
    percentBps: useEvent
      ? Math.max(0, input.eventPercentBps ?? 0)
      : Math.max(0, input.orgPercentBps ?? 0),
    taxRateBps: Math.max(0, input.orgTaxBps ?? 700),
    source: useEvent ? "event" : "organization",
  };
}

/** @deprecated use computePlatformFee / order-pricing */
export function computePresaleFee(input: {
  ticketCount: number;
  ticketsGrossCents: number;
  config: FeeConfig;
}): FeeComputation {
  const { ticketCount, ticketsGrossCents, config } = input;
  let feeGrossCents = 0;

  if (config.mode === "fixed_per_ticket") {
    feeGrossCents = ticketCount * config.fixedCents;
  } else if (config.mode === "percent") {
    feeGrossCents = Math.round((ticketsGrossCents * config.percentBps) / 10000);
  }

  const split = splitGrossToNetTax(feeGrossCents, config.taxRateBps);
  const label =
    config.mode === "none" || feeGrossCents === 0
      ? "Vorverkaufsgebühr (0,00 €)"
      : config.mode === "fixed_per_ticket"
        ? `Vorverkaufsgebühr (${(config.fixedCents / 100).toFixed(2)} € / Ticket)`
        : `Vorverkaufsgebühr (${(config.percentBps / 100).toFixed(2)} %)`;

  return {
    ticketCount,
    ticketsGrossCents,
    feeGrossCents: split.grossCents,
    feeNetCents: split.netCents,
    feeTaxCents: split.taxCents,
    totalGrossCents: ticketsGrossCents + split.grossCents,
    config,
    label,
  };
}
