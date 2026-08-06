import { describe, expect, it } from "vitest";
import {
  checkinLockedMessage,
  evaluateCheckinGate,
  isProductionCheckinOpen,
} from "@/lib/commerce/checkin-gate";

describe("checkin gate", () => {
  const now = new Date("2026-08-06T16:00:00.000Z");
  const doorsFuture = new Date("2026-08-06T17:00:00.000Z");
  const doorsPast = new Date("2026-08-06T15:00:00.000Z");

  it("unlocks when doorsOpenAt is reached", () => {
    expect(evaluateCheckinGate({ doorsOpenAt: doorsPast, saleClosedEarly: false }, now)).toEqual({
      open: true,
      reason: "doors_open",
    });
    expect(isProductionCheckinOpen({ doorsOpenAt: doorsPast }, now)).toBe(true);
  });

  it("stays locked before doorsOpenAt", () => {
    expect(evaluateCheckinGate({ doorsOpenAt: doorsFuture, saleClosedEarly: false }, now)).toEqual({
      open: false,
      reason: "doors_not_open",
    });
    expect(checkinLockedMessage({ doorsOpenAt: doorsFuture }, now)).toBe(
      "Einlass noch nicht geöffnet",
    );
  });

  it("unlocks when sale closed early even before doors", () => {
    expect(
      evaluateCheckinGate({ doorsOpenAt: doorsFuture, saleClosedEarly: true }, now),
    ).toEqual({ open: true, reason: "sale_closed_early" });
  });

  it("stays locked when doorsOpenAt is missing and sale still open", () => {
    expect(evaluateCheckinGate({ doorsOpenAt: null, saleClosedEarly: false }, now)).toEqual({
      open: false,
      reason: "doors_not_set",
    });
    expect(checkinLockedMessage({ doorsOpenAt: null }, now)).toContain("nicht hinterlegt");
  });

  it("unlocks with saleClosedEarly when doorsOpenAt is missing", () => {
    expect(isProductionCheckinOpen({ doorsOpenAt: null, saleClosedEarly: true }, now)).toBe(true);
  });
});
