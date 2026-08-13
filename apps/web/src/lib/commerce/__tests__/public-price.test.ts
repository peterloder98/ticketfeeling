import { describe, expect, it } from "vitest";
import {
  customerUnitPriceCents,
  formatCustomerPriceLabel,
  formatFeeIncludedNote,
  orderItemCustomerPaidCents,
} from "@/lib/commerce/public-price";

describe("orderItemCustomerPaidCents", () => {
  it("adds proportional Verwaltungsgebühr to the ticket line", () => {
    expect(
      orderItemCustomerPaidCents(10000, {
        administrationFeeGrossCents: 800,
        ticketsGrossCents: 20000,
        discountCents: 0,
      }),
    ).toBe(10400);
  });

  it("returns ticket-only when no fee", () => {
    expect(
      orderItemCustomerPaidCents(5000, {
        feeGrossCents: 0,
        ticketsGrossCents: 5000,
        discountCents: 0,
      }),
    ).toBe(5000);
  });

  it("prefers administrationFeeGrossCents over feeGrossCents", () => {
    expect(
      orderItemCustomerPaidCents(10000, {
        administrationFeeGrossCents: 400,
        feeGrossCents: 999,
        ticketsGrossCents: 10000,
        discountCents: 0,
      }),
    ).toBe(10400);
  });

  it("allocates against tickets after discount", () => {
    expect(
      orderItemCustomerPaidCents(9000, {
        feeGrossCents: 360,
        ticketsGrossCents: 10000,
        discountCents: 1000,
      }),
    ).toBe(9360);
  });
});

describe("customerUnitPriceCents", () => {
  it("includes percentage fee in unit total", () => {
    expect(
      customerUnitPriceCents(10000, { enabled: true, percentageBasisPoints: 400 }),
    ).toBe(10400);
  });
});

describe("formatCustomerPriceLabel", () => {
  const feeOn = {
    enabled: true,
    percentageBasisPoints: 400,
    displayName: "Verwaltungsgebühr",
  };
  const formatEuro = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

  it("shows ticket price and zzgl. note without fee math in the label", () => {
    const labeled = formatCustomerPriceLabel({
      ticketGrossCents: 10000,
      feeConfig: feeOn,
      formatEuro,
      prefix: "ab",
    });
    expect(labeled.totalLabel).toBe("ab 100,00 €");
    expect(labeled.surchargeLabel).toBe("zzgl. 4 % Verwaltungsgebühr");
    expect(labeled.ticketCents).toBe(10000);
    expect(labeled.totalCents).toBe(10400);
    expect(labeled.feeCents).toBe(400);
  });

  it("omits surcharge when fee is disabled", () => {
    const labeled = formatCustomerPriceLabel({
      ticketGrossCents: 5000,
      feeConfig: { enabled: false, percentageBasisPoints: 400, displayName: "Verwaltungsgebühr" },
      formatEuro,
      prefix: "ab",
    });
    expect(labeled.totalLabel).toBe("ab 50,00 €");
    expect(labeled.surchargeLabel).toBe("");
  });
});

describe("formatFeeIncludedNote", () => {
  it("returns calm inkl. note without percent", () => {
    expect(
      formatFeeIncludedNote({
        enabled: true,
        percentageBasisPoints: 400,
        displayName: "Verwaltungsgebühr",
      }),
    ).toBe("inkl. Verwaltungsgebühr");
  });

  it("returns empty when fee is off", () => {
    expect(
      formatFeeIncludedNote({
        enabled: false,
        percentageBasisPoints: 400,
        displayName: "Verwaltungsgebühr",
      }),
    ).toBe("");
    expect(
      formatFeeIncludedNote({
        enabled: true,
        percentageBasisPoints: 0,
        displayName: "Verwaltungsgebühr",
      }),
    ).toBe("");
  });
});
