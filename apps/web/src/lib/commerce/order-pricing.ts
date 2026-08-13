import { splitGrossToNetTax } from "@/lib/money";
import {
  PLATFORM_FEE_CALCULATION_VERSION,
  computePlatformFeeGrossCents,
  resolveActivePlatformFeeConfig,
  type PlatformFeeConfig,
} from "@/lib/commerce/platform-fee";
import {
  allocateFeeAcrossTaxRates,
  sumFeeAllocations,
  type FeeTaxAllocation,
} from "@/lib/commerce/tax-allocation";

export type PricedLineInput = {
  quantity: number;
  unitGrossCents: number;
  taxRateBps: number;
  /** Tickets are fee-eligible; gifts/donations are not */
  feeEligible?: boolean;
};

export type OrderPricingResult = {
  ticketsGrossCents: number;
  discountCents: number;
  ticketsAfterDiscountCents: number;
  feeBaseCents: number;
  administrationFeePercentageBasisPoints: number;
  administrationFeeGrossCents: number;
  administrationFeeNetCents: number;
  administrationFeeTaxCents: number;
  administrationFeeTaxAllocations: FeeTaxAllocation[];
  displayName: string;
  feeLabel: string;
  giftCardAppliedCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  customerTotalCents: number;
  calculationVersion: string;
  platformFeeConfig: PlatformFeeConfig;
  feeSnapshot: Record<string, unknown>;
  lineSplits: {
    quantity: number;
    unitGrossCents: number;
    taxRateBps: number;
    lineGrossCents: number;
    lineNetCents: number;
    lineTaxCents: number;
    discountShareCents: number;
  }[];
};

/**
 * Single source of truth for cart/order money math.
 * All amounts integer cents; percentages as basis points.
 */
export function computeOrderPricing(input: {
  lines: PricedLineInput[];
  discountCents?: number;
  giftCardAppliedCents?: number;
  platformFeeConfigRaw: unknown;
  at?: Date;
}): OrderPricingResult {
  const config = resolveActivePlatformFeeConfig(input.platformFeeConfigRaw, input.at);
  const lines = input.lines.filter((l) => l.quantity > 0 && l.unitGrossCents >= 0);

  const ticketsGrossCents = lines.reduce(
    (s, l) => s + l.quantity * l.unitGrossCents,
    0,
  );
  const discountCents = Math.min(
    Math.max(0, input.discountCents ?? 0),
    ticketsGrossCents,
  );
  const ticketsAfterDiscountCents = ticketsGrossCents - discountCents;

  const feeBaseCents =
    config.calculationBase === "ticket_subtotal_before_discounts"
      ? ticketsGrossCents
      : ticketsAfterDiscountCents;

  const eligibleGrossBeforeDiscount = lines.reduce((s, l) => {
    if (l.feeEligible === false) return s;
    return s + l.quantity * l.unitGrossCents;
  }, 0);

  // Scale eligible base with discount when using after-discount base
  let feeEligibleBase = feeBaseCents;
  if (
    config.calculationBase === "ticket_subtotal_after_discounts" &&
    ticketsGrossCents > 0 &&
    eligibleGrossBeforeDiscount < ticketsGrossCents
  ) {
    const scale = ticketsAfterDiscountCents / ticketsGrossCents;
    feeEligibleBase = Math.round(eligibleGrossBeforeDiscount * scale);
  } else if (config.calculationBase === "ticket_subtotal_before_discounts") {
    feeEligibleBase = eligibleGrossBeforeDiscount;
  }

  const administrationFeeGrossCents =
    config.enabled && feeEligibleBase > 0
      ? computePlatformFeeGrossCents(feeEligibleBase, config.percentageBasisPoints)
      : 0;

  // Discount shares proportional to line gross
  const lineSplits = lines.map((l) => {
    const lineGrossList = l.quantity * l.unitGrossCents;
    const discountShare =
      ticketsGrossCents > 0
        ? Math.round((discountCents * lineGrossList) / ticketsGrossCents)
        : 0;
    const lineGrossPaid = Math.max(0, lineGrossList - discountShare);
    const split = splitGrossToNetTax(lineGrossPaid, l.taxRateBps);
    return {
      quantity: l.quantity,
      unitGrossCents: l.unitGrossCents,
      taxRateBps: l.taxRateBps,
      lineGrossCents: split.grossCents,
      lineNetCents: split.netCents,
      lineTaxCents: split.taxCents,
      discountShareCents: discountShare,
      feeEligible: l.feeEligible !== false,
      lineGrossList,
    };
  });

  // Fix discount rounding drift on last line
  const discountAssigned = lineSplits.reduce((s, l) => s + l.discountShareCents, 0);
  if (discountAssigned !== discountCents && lineSplits.length > 0) {
    const last = lineSplits[lineSplits.length - 1];
    last.discountShareCents += discountCents - discountAssigned;
    const lineGrossPaid = Math.max(0, last.lineGrossList - last.discountShareCents);
    const split = splitGrossToNetTax(lineGrossPaid, last.taxRateBps);
    last.lineGrossCents = split.grossCents;
    last.lineNetCents = split.netCents;
    last.lineTaxCents = split.taxCents;
  }

  const taxGroups = new Map<number, number>();
  for (const l of lineSplits) {
    if (!l.feeEligible) continue;
    taxGroups.set(l.taxRateBps, (taxGroups.get(l.taxRateBps) ?? 0) + l.lineGrossCents);
  }

  const forceTax =
    config.taxMode === "custom" ? (config.customTaxRateBasisPoints ?? 700) : null;

  const administrationFeeTaxAllocations = allocateFeeAcrossTaxRates({
    feeGrossCents: administrationFeeGrossCents,
    groups: [...taxGroups.entries()].map(([taxRateBasisPoints, eligibleGrossCents]) => ({
      taxRateBasisPoints,
      eligibleGrossCents,
    })),
    forceTaxRateBps: forceTax,
  });

  const feeSum = sumFeeAllocations(administrationFeeTaxAllocations);
  const administrationFeeNetCents = feeSum.netCents;
  const administrationFeeTaxCents = feeSum.taxCents;

  const ticketNet = lineSplits.reduce((s, l) => s + l.lineNetCents, 0);
  const ticketTax = lineSplits.reduce((s, l) => s + l.lineTaxCents, 0);

  const beforeGift = ticketsAfterDiscountCents + administrationFeeGrossCents;
  const giftCardAppliedCents = Math.min(
    Math.max(0, input.giftCardAppliedCents ?? 0),
    beforeGift,
  );
  const customerTotalCents = Math.max(0, beforeGift - giftCardAppliedCents);

  const netCents = ticketNet + administrationFeeNetCents;
  const taxCents = ticketTax + administrationFeeTaxCents;
  const grossCents = customerTotalCents;

  // Percent lives in the (i) dialog — keep the line label calm: „Verwaltungsgebühr“.
  const feeLabel = config.displayName;

  const feeSnapshot = {
    kind: "administration_fee",
    calculationVersion: PLATFORM_FEE_CALCULATION_VERSION,
    config: {
      enabled: config.enabled,
      percentageBasisPoints: config.percentageBasisPoints,
      displayName: config.displayName,
      calculationBase: config.calculationBase,
      taxMode: config.taxMode,
      customTaxRateBasisPoints: config.customTaxRateBasisPoints,
      version: config.version,
    },
    feeBaseCents: feeEligibleBase,
    feeGrossCents: administrationFeeGrossCents,
    feeNetCents: administrationFeeNetCents,
    feeTaxCents: administrationFeeTaxCents,
    allocations: administrationFeeTaxAllocations,
  };

  return {
    ticketsGrossCents,
    discountCents,
    ticketsAfterDiscountCents,
    feeBaseCents: feeEligibleBase,
    administrationFeePercentageBasisPoints: config.enabled
      ? config.percentageBasisPoints
      : 0,
    administrationFeeGrossCents,
    administrationFeeNetCents,
    administrationFeeTaxCents,
    administrationFeeTaxAllocations,
    displayName: config.displayName,
    feeLabel,
    giftCardAppliedCents,
    netCents,
    taxCents,
    grossCents,
    customerTotalCents,
    calculationVersion: PLATFORM_FEE_CALCULATION_VERSION,
    platformFeeConfig: config,
    feeSnapshot,
    lineSplits: lineSplits.map(
      ({
        quantity,
        unitGrossCents,
        taxRateBps,
        lineGrossCents,
        lineNetCents,
        lineTaxCents,
        discountShareCents,
      }) => ({
        quantity,
        unitGrossCents,
        taxRateBps,
        lineGrossCents,
        lineNetCents,
        lineTaxCents,
        discountShareCents,
      }),
    ),
  };
}
