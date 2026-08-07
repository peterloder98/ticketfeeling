import { describe, expect, it } from "vitest";
import {
  allowDevPaymentsInProduction,
  isPaymentTestMode,
  isStripeTestMode,
} from "@/lib/payments/mode";
import {
  isDemoOrderContract,
  isSyntheticBuyerEmail,
} from "@/lib/commerce/customers";

describe("payment mode helpers", () => {
  it("reads ALLOW_DEV_PAYMENTS", () => {
    const prev = process.env.ALLOW_DEV_PAYMENTS;
    process.env.ALLOW_DEV_PAYMENTS = "1";
    expect(allowDevPaymentsInProduction()).toBe(true);
    process.env.ALLOW_DEV_PAYMENTS = "true";
    expect(allowDevPaymentsInProduction()).toBe(true);
    process.env.ALLOW_DEV_PAYMENTS = "0";
    expect(allowDevPaymentsInProduction()).toBe(false);
    if (prev === undefined) delete process.env.ALLOW_DEV_PAYMENTS;
    else process.env.ALLOW_DEV_PAYMENTS = prev;
  });

  it("detects Stripe test keys", () => {
    const prevSk = process.env.STRIPE_SECRET_KEY;
    const prevPk = process.env.STRIPE_PUBLISHABLE_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_abc";
    expect(isStripeTestMode()).toBe(true);
    expect(isPaymentTestMode("stripe")).toBe(true);
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_live_abc";
    expect(isStripeTestMode()).toBe(false);
    expect(isPaymentTestMode("dev")).toBe(true);
    if (prevSk === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevSk;
    if (prevPk === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
    else process.env.STRIPE_PUBLISHABLE_KEY = prevPk;
  });
});

describe("synthetic buyer / demo order", () => {
  it("flags fake domains", () => {
    expect(isSyntheticBuyerEmail("anna@ticketfeeling-test.local")).toBe(true);
    expect(isSyntheticBuyerEmail("x@example.test")).toBe(true);
    expect(isSyntheticBuyerEmail("kasse@ticketfeeling.local")).toBe(true);
    expect(isSyntheticBuyerEmail("real@example.com")).toBe(false);
  });

  it("flags demo contract snapshot", () => {
    expect(isDemoOrderContract({ demo: true })).toBe(true);
    expect(isDemoOrderContract({ demo: false })).toBe(false);
    expect(isDemoOrderContract({})).toBe(false);
  });
});
