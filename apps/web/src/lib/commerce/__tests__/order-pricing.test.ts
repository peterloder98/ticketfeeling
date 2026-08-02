import { describe, expect, it } from "vitest";
import { computeOrderPricing } from "@/lib/commerce/order-pricing";
import { computePlatformFeeGrossCents } from "@/lib/commerce/platform-fee";
import { allocateFeeAcrossTaxRates } from "@/lib/commerce/tax-allocation";
import { customerUnitPriceCents } from "@/lib/commerce/public-price";

const fee3 = {
  enabled: true,
  percentageBasisPoints: 300,
  displayName: "Verwaltungsgebühr",
  calculationBase: "ticket_subtotal_after_discounts" as const,
  taxMode: "inherit_ticket_tax_rate" as const,
  customTaxRateBasisPoints: null,
  customerDescription: "test",
  activeFrom: null,
  version: 1,
};

describe("platform fee cents", () => {
  it("1×49€ → 1,47€ fee → 50,47€", () => {
    expect(computePlatformFeeGrossCents(4900, 300)).toBe(147);
    expect(customerUnitPriceCents(4900, fee3)).toBe(5047);
  });

  it("1×59€ → 1,77€ fee → 60,77€", () => {
    expect(computePlatformFeeGrossCents(5900, 300)).toBe(177);
    const priced = computeOrderPricing({
      lines: [{ quantity: 1, unitGrossCents: 5900, taxRateBps: 700 }],
      platformFeeConfigRaw: fee3,
    });
    expect(priced.administrationFeeGrossCents).toBe(177);
    expect(priced.customerTotalCents).toBe(6077);
  });

  it("1×159€ VIP → 4,77€ fee", () => {
    expect(computePlatformFeeGrossCents(15900, 300)).toBe(477);
  });

  it("2×59€ → 3,54€ fee → 121,54€", () => {
    const priced = computeOrderPricing({
      lines: [{ quantity: 2, unitGrossCents: 5900, taxRateBps: 700 }],
      platformFeeConfigRaw: fee3,
    });
    expect(priced.ticketsGrossCents).toBe(11800);
    expect(priced.administrationFeeGrossCents).toBe(354);
    expect(priced.customerTotalCents).toBe(12154);
  });

  it("100% discount → no fee", () => {
    const priced = computeOrderPricing({
      lines: [{ quantity: 1, unitGrossCents: 5900, taxRateBps: 700 }],
      discountCents: 5900,
      platformFeeConfigRaw: fee3,
    });
    expect(priced.administrationFeeGrossCents).toBe(0);
    expect(priced.customerTotalCents).toBe(0);
  });

  it("order discount reduces fee base", () => {
    const priced = computeOrderPricing({
      lines: [{ quantity: 1, unitGrossCents: 5900, taxRateBps: 700 }],
      discountCents: 900,
      platformFeeConfigRaw: fee3,
    });
    // base 50€ → 1,50€
    expect(priced.ticketsAfterDiscountCents).toBe(5000);
    expect(priced.administrationFeeGrossCents).toBe(150);
    expect(priced.customerTotalCents).toBe(5150);
  });

  it("config change 2.5% does not alter snapshot math for 3%", () => {
    const at3 = computeOrderPricing({
      lines: [{ quantity: 1, unitGrossCents: 5900, taxRateBps: 700 }],
      platformFeeConfigRaw: fee3,
    });
    const at25 = computeOrderPricing({
      lines: [{ quantity: 1, unitGrossCents: 5900, taxRateBps: 700 }],
      platformFeeConfigRaw: { ...fee3, percentageBasisPoints: 250 },
    });
    expect(at3.administrationFeePercentageBasisPoints).toBe(300);
    expect(at25.administrationFeePercentageBasisPoints).toBe(250);
    expect(at25.administrationFeeGrossCents).toBe(148); // round(5900*250/10000)
    expect(at3.administrationFeeGrossCents).toBe(177);
  });
});

describe("tax allocation", () => {
  it("splits fee across 7% and 19% groups", () => {
    const allocations = allocateFeeAcrossTaxRates({
      feeGrossCents: 300,
      groups: [
        { taxRateBasisPoints: 700, eligibleGrossCents: 5900 },
        { taxRateBasisPoints: 1900, eligibleGrossCents: 5900 },
      ],
    });
    const sum = allocations.reduce((s, a) => s + a.grossAmountCents, 0);
    expect(sum).toBe(300);
    expect(allocations).toHaveLength(2);
  });

  it("7% ticket tax split is consistent", () => {
    const priced = computeOrderPricing({
      lines: [{ quantity: 1, unitGrossCents: 5900, taxRateBps: 700 }],
      platformFeeConfigRaw: fee3,
    });
    expect(priced.netCents + priced.taxCents).toBe(
      priced.ticketsAfterDiscountCents + priced.administrationFeeGrossCents,
    );
    expect(priced.administrationFeeTaxAllocations[0]?.taxRateBasisPoints).toBe(700);
  });
});
