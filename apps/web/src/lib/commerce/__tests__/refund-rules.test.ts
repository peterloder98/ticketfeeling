import { describe, expect, it } from "vitest";
import { isFullRefund, shouldVoidTicketsOnRefund } from "@/lib/commerce/refund-rules";

describe("refund-rules", () => {
  it("treats refund of customer total as full", () => {
    expect(
      isFullRefund({
        refundedAmountCents: 6077,
        customerTotalCents: 6077,
        grossCents: 6077,
      }),
    ).toBe(true);
    expect(
      shouldVoidTicketsOnRefund({
        refundedAmountCents: 6077,
        customerTotalCents: 6077,
        grossCents: 6077,
      }),
    ).toBe(true);
  });

  it("keeps tickets on partial refund", () => {
    expect(
      shouldVoidTicketsOnRefund({
        refundedAmountCents: 1000,
        customerTotalCents: 6077,
        grossCents: 6077,
      }),
    ).toBe(false);
  });

  it("prefers customerTotal over gross", () => {
    expect(
      isFullRefund({
        refundedAmountCents: 5000,
        customerTotalCents: 5000,
        grossCents: 4800,
      }),
    ).toBe(true);
  });
});
