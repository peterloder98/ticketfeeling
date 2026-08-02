import { splitGrossToNetTax } from "@/lib/money";

export type FeeTaxAllocation = {
  taxRateBasisPoints: number;
  grossAmountCents: number;
  netAmountCents: number;
  taxAmountCents: number;
};

/**
 * Split fee gross proportionally across tax groups by eligible line gross.
 * Remainder cents go to the largest group (deterministic).
 */
export function allocateFeeAcrossTaxRates(input: {
  feeGrossCents: number;
  groups: { taxRateBasisPoints: number; eligibleGrossCents: number }[];
  /** When set, ignore groups and tax entire fee at this rate */
  forceTaxRateBps?: number | null;
}): FeeTaxAllocation[] {
  const fee = Math.max(0, input.feeGrossCents);
  if (fee === 0) return [];

  if (input.forceTaxRateBps != null) {
    const split = splitGrossToNetTax(fee, input.forceTaxRateBps);
    return [
      {
        taxRateBasisPoints: input.forceTaxRateBps,
        grossAmountCents: split.grossCents,
        netAmountCents: split.netCents,
        taxAmountCents: split.taxCents,
      },
    ];
  }

  const positive = input.groups.filter((g) => g.eligibleGrossCents > 0);
  if (positive.length === 0) {
    const split = splitGrossToNetTax(fee, 700);
    return [
      {
        taxRateBasisPoints: 700,
        grossAmountCents: split.grossCents,
        netAmountCents: split.netCents,
        taxAmountCents: split.taxCents,
      },
    ];
  }

  const totalEligible = positive.reduce((s, g) => s + g.eligibleGrossCents, 0);
  const sorted = [...positive].sort((a, b) => {
    if (b.eligibleGrossCents !== a.eligibleGrossCents) {
      return b.eligibleGrossCents - a.eligibleGrossCents;
    }
    return a.taxRateBasisPoints - b.taxRateBasisPoints;
  });

  let allocated = 0;
  const raw: { taxRateBasisPoints: number; grossAmountCents: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    let share: number;
    if (i === sorted.length - 1) {
      share = fee - allocated;
    } else {
      share = Math.round((fee * g.eligibleGrossCents) / totalEligible);
      allocated += share;
    }
    raw.push({ taxRateBasisPoints: g.taxRateBasisPoints, grossAmountCents: share });
  }

  // Merge same rates
  const byRate = new Map<number, number>();
  for (const row of raw) {
    byRate.set(row.taxRateBasisPoints, (byRate.get(row.taxRateBasisPoints) ?? 0) + row.grossAmountCents);
  }

  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taxRateBasisPoints, grossAmountCents]) => {
      const split = splitGrossToNetTax(grossAmountCents, taxRateBasisPoints);
      return {
        taxRateBasisPoints,
        grossAmountCents: split.grossCents,
        netAmountCents: split.netCents,
        taxAmountCents: split.taxCents,
      };
    });
}

export function sumFeeAllocations(allocations: FeeTaxAllocation[]) {
  return allocations.reduce(
    (acc, a) => ({
      grossCents: acc.grossCents + a.grossAmountCents,
      netCents: acc.netCents + a.netAmountCents,
      taxCents: acc.taxCents + a.taxAmountCents,
    }),
    { grossCents: 0, netCents: 0, taxCents: 0 },
  );
}
