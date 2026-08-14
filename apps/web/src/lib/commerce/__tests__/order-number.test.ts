import { describe, expect, it } from "vitest";
import { ticketNumbersFromLast } from "@/lib/commerce/order-number";

describe("ticketNumbersFromLast", () => {
  it("allocates a contiguous batch after atomic increment", () => {
    expect(ticketNumbersFromLast(2026, 5, 3)).toEqual([
      "TF-T-2026-00000003",
      "TF-T-2026-00000004",
      "TF-T-2026-00000005",
    ]);
  });

  it("returns a single number", () => {
    expect(ticketNumbersFromLast(2026, 1, 1)).toEqual(["TF-T-2026-00000001"]);
  });

  it("rejects invalid batches", () => {
    expect(ticketNumbersFromLast(2026, 2, 0)).toEqual([]);
    expect(ticketNumbersFromLast(2026, 1, 3)).toEqual([]);
  });
});
