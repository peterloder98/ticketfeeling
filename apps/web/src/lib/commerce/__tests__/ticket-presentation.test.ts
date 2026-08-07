import { describe, expect, it } from "vitest";
import {
  formatProminentPlaceLabel,
  isVipCategory,
  resolvePlaceLabel,
} from "@/lib/commerce/ticket-presentation";

describe("isVipCategory", () => {
  it("detects vip kind and name", () => {
    expect(isVipCategory("VIP", "vip")).toBe(true);
    expect(isVipCategory("VIP Lounge", "standard")).toBe(true);
    expect(isVipCategory("Normal", "standard")).toBe(false);
  });
});

describe("resolvePlaceLabel", () => {
  it("prefers seat label", () => {
    expect(
      resolvePlaceLabel({
        seatLabel: "Reihe 2 · Platz 7",
        categoryKind: "standing",
      }),
    ).toBe("Reihe 2 · Platz 7");
  });

  it("falls back by category kind", () => {
    expect(resolvePlaceLabel({ categoryKind: "standing" })).toBe("Stehplatz");
    expect(resolvePlaceLabel({ categoryKind: "free_choice" })).toBe("Freie Platzwahl");
    expect(resolvePlaceLabel({ freeSeating: true })).toBe("Freie Platzwahl");
  });
});

describe("formatProminentPlaceLabel", () => {
  it("uppercases assigned seats", () => {
    expect(formatProminentPlaceLabel("Block A · Reihe 1 · Platz 9")).toEqual({
      label: "BLOCK A · REIHE 1 · PLATZ 9",
      hasAssignedSeat: true,
    });
  });

  it("formats free seating and standing", () => {
    expect(formatProminentPlaceLabel("Freie Platzwahl")).toEqual({
      label: "FREIE PLATZWAHL",
      hasAssignedSeat: false,
    });
    expect(formatProminentPlaceLabel("Stehplatz")).toEqual({
      label: "Stehplatz",
      hasAssignedSeat: false,
    });
  });
});
