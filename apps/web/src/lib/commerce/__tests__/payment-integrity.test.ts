import { describe, expect, it } from "vitest";
import { planGiftCardDebit } from "@/lib/commerce/discounts";
import {
  isOrderAlreadyFulfilled,
  paymentAmountMatchesOrder,
} from "@/lib/commerce/payment-amount-guard";

describe("paymentAmountMatchesOrder", () => {
  it("accepts matching amount and currency", () => {
    const result = paymentAmountMatchesOrder({
      paymentAmountCents: 6077,
      paymentCurrency: "eur",
      customerTotalCents: 6077,
      grossCents: 6077,
      orderCurrency: "EUR",
    });
    expect(result.ok).toBe(true);
  });

  it("blocks amount mismatch (defense in depth)", () => {
    const result = paymentAmountMatchesOrder({
      paymentAmountCents: 100,
      paymentCurrency: "eur",
      customerTotalCents: 6077,
      grossCents: 6077,
      orderCurrency: "EUR",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("amount_mismatch");
      expect(result.expectedCents).toBe(6077);
      expect(result.actualCents).toBe(100);
    }
  });

  it("blocks currency mismatch", () => {
    const result = paymentAmountMatchesOrder({
      paymentAmountCents: 6077,
      paymentCurrency: "usd",
      customerTotalCents: 6077,
      grossCents: 6077,
      orderCurrency: "EUR",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("currency_mismatch");
  });

  it("uses customerTotal || gross like checkout PI creation", () => {
    const result = paymentAmountMatchesOrder({
      paymentAmountCents: 5000,
      paymentCurrency: "eur",
      customerTotalCents: 0,
      grossCents: 5000,
      orderCurrency: "EUR",
    });
    expect(result.ok).toBe(true);
  });
});

describe("isOrderAlreadyFulfilled (QR stability / double webhook)", () => {
  it("short-circuits when locked, fulfilled, and tickets exist", () => {
    expect(
      isOrderAlreadyFulfilled({
        fulfillmentLockedAt: new Date(),
        status: "fulfilled",
        ticketCount: 2,
      }),
    ).toBe(true);
  });

  it("does not short-circuit without tickets (retry may mint once)", () => {
    expect(
      isOrderAlreadyFulfilled({
        fulfillmentLockedAt: new Date(),
        status: "paid",
        ticketCount: 0,
      }),
    ).toBe(false);
  });
});

describe("planGiftCardDebit (single debit)", () => {
  it("debits once and marks exhausted at zero", () => {
    expect(planGiftCardDebit(2500, 2500)).toEqual({
      balanceAfterCents: 0,
      status: "exhausted",
    });
  });

  it("keeps active when balance remains", () => {
    expect(planGiftCardDebit(5000, 1500)).toEqual({
      balanceAfterCents: 3500,
      status: "active",
    });
  });

  it("rejects over-debit", () => {
    expect(() => planGiftCardDebit(100, 200)).toThrow("GIFT_CARD_INSUFFICIENT");
  });

  it("is a no-op for zero applied (idempotent second pass shape)", () => {
    expect(planGiftCardDebit(3500, 0)).toEqual({
      balanceAfterCents: 3500,
      status: "active",
    });
  });
});
