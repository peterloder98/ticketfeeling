import { splitGrossToNetTax } from "@/lib/money";

export type PresaleFeeMode = "none" | "fixed_per_ticket" | "percent";

export type FeeConfig = {
  mode: PresaleFeeMode;
  fixedCents: number;
  percentBps: number;
  taxRateBps: number;
  source: "organization" | "event";
};

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

export function normalizeFeeMode(value: string | null | undefined): PresaleFeeMode {
  if (value === "fixed_per_ticket" || value === "percent" || value === "none") return value;
  return "none";
}

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
