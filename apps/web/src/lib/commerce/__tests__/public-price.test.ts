import { describe, expect, it } from "vitest";
import {
  customerUnitPriceCents,
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
