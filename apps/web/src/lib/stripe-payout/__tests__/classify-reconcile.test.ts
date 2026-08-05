import { describe, expect, it } from "vitest";
import { classifyBalanceTransaction } from "@/lib/stripe-payout/classify";
import {
  computePayoutNetSumCents,
  reconcilePayoutAmount,
} from "@/lib/stripe-payout/reconcile";

describe("classifyBalanceTransaction", () => {
  it("classifies charge as payment", () => {
    expect(classifyBalanceTransaction({ type: "charge" })).toBe("payment");
  });
  it("classifies refund", () => {
    expect(classifyBalanceTransaction({ type: "refund" })).toBe("refund");
  });
  it("classifies stripe_fee", () => {
    expect(classifyBalanceTransaction({ type: "stripe_fee" })).toBe("stripe_fee");
  });
  it("never drops unknown types", () => {
    expect(classifyBalanceTransaction({ type: "weird_future_type_xyz" })).toBe("unknown");
  });
  it("classifies dispute fee from description", () => {
    expect(
      classifyBalanceTransaction({
        type: "network_cost",
        description: "Dispute fee",
      }),
    ).toBe("dispute_fee");
  });
});

describe("reconcilePayoutAmount", () => {
  it("requires pagination complete", () => {
    const r = reconcilePayoutAmount({
      payoutAmountCents: 1000,
      balanceTransactions: [{ netCents: 1000 }],
      paginationComplete: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("pagination_incomplete");
  });

  it("excludes payout row from net sum", () => {
    expect(
      computePayoutNetSumCents([
        { netCents: 10_185, type: "charge" },
        { netCents: -185, type: "stripe_fee" },
        { netCents: -10_000, type: "payout" },
      ]),
    ).toBe(10_000);
  });

  it("matches when nets sum to payout amount", () => {
    const r = reconcilePayoutAmount({
      payoutAmountCents: 10_000,
      balanceTransactions: [
        { netCents: 10_185, type: "charge" },
        { netCents: -185, type: "stripe_fee" },
        { netCents: -10_000, type: "payout" },
      ],
      paginationComplete: true,
    });
    expect(r.differenceCents).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("fails on 1 cent difference", () => {
    const r = reconcilePayoutAmount({
      payoutAmountCents: 10_000,
      balanceTransactions: [{ netCents: 10_001, type: "charge" }],
      paginationComplete: true,
    });
    expect(r.ok).toBe(false);
    expect(r.differenceCents).toBe(1);
  });
});
