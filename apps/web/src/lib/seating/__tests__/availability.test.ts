import { describe, expect, it } from "vitest";
import {
  countAvailableForCategory,
  countSellableAvailableSeats,
  multiCategorySelectionCap,
} from "@/lib/seating/availability";
import type { SeatMapPayload } from "@/lib/seating/types";
import { categoryNeedsSeats } from "@/lib/seating/types";
import { categoryFillRgba, hexToRgb } from "@/lib/seating/layout-config";

describe("countSellableAvailableSeats", () => {
  const seats = [
    { status: "available", locked: false, categoryId: "a" },
    { status: "available", locked: false, categoryId: "a" },
    { status: "available", locked: false, categoryId: "b" },
    { status: "available", locked: false, categoryId: null },
    { status: "sold", locked: false, categoryId: "a" },
    { status: "available", locked: true, categoryId: "b" },
    { status: "held", locked: false, categoryId: "b" },
  ];

  it("excludes unassigned seats once categories are assigned", () => {
    expect(
      countSellableAvailableSeats(seats, { assignedCategoryIds: ["a", "b"] }),
    ).toBe(3);
  });

  it("filters by category", () => {
    expect(
      countSellableAvailableSeats(seats, {
        categoryId: "a",
        assignedCategoryIds: ["a", "b"],
      }),
    ).toBe(2);
    expect(
      countSellableAvailableSeats(seats, {
        categoryId: "b",
        assignedCategoryIds: ["a", "b"],
      }),
    ).toBe(1);
  });
});

describe("countAvailableForCategory includes standing inventory", () => {
  it("counts standingSeats for Stehplatz even when blocks are empty", () => {
    const map = {
      blocks: [],
      standingSeats: [
        {
          id: "1",
          seatKey: "z:ST:1",
          blockObjectId: "z",
          blockLabel: "Steh",
          rowIndex: 1,
          seatIndex: 1,
          rowLabel: "Steh",
          seatNumber: "1",
          categoryId: "steh",
          locked: false,
          status: "available" as const,
        },
        {
          id: "2",
          seatKey: "z:ST:2",
          blockObjectId: "z",
          blockLabel: "Steh",
          rowIndex: 1,
          seatIndex: 2,
          rowLabel: "Steh",
          seatNumber: "2",
          categoryId: "steh",
          locked: false,
          status: "available" as const,
        },
        {
          id: "3",
          seatKey: "z:ST:3",
          blockObjectId: "z",
          blockLabel: "Steh",
          rowIndex: 1,
          seatIndex: 3,
          rowLabel: "Steh",
          seatNumber: "3",
          categoryId: "steh",
          locked: true,
          status: "locked" as const,
        },
      ],
      categories: [{ id: "steh", name: "Stehplatz", color: "#0F2747" }],
    } as unknown as SeatMapPayload;
    expect(countAvailableForCategory(map, "steh")).toBe(2);
  });
});

describe("categoryNeedsSeats (plan-backed Stehplatz)", () => {
  it("requires EventSeat holds for standing when seating is on", () => {
    expect(
      categoryNeedsSeats({
        seatingBookingMode: "seat_map_and_best",
        categoryKind: "standing",
        freeSeating: true,
      }),
    ).toBe(true);
    expect(
      categoryNeedsSeats({
        seatingBookingMode: "none",
        categoryKind: "standing",
        freeSeating: true,
      }),
    ).toBe(false);
    expect(
      categoryNeedsSeats({
        seatingBookingMode: "seat_map_and_best",
        categoryKind: "free_choice",
        freeSeating: true,
      }),
    ).toBe(false);
  });
});

describe("categoryFillRgba", () => {
  it("uses a strong interior fill so assignment reads as paint, not a frame", () => {
    const navy = hexToRgb("#0F2747");
    expect(navy).toEqual({ r: 15, g: 39, b: 71 });
    expect(categoryFillRgba("#0F2747")).toBe("rgba(15,39,71,0.68)");
    expect(categoryFillRgba("#14B8A6")).toBe("rgba(20,184,166,0.55)");
    expect(categoryFillRgba("#0F2747", 0.28)).toBe("rgba(15,39,71,0.68)");
    expect(categoryFillRgba("#14B8A6", 0.28)).toBe("rgba(20,184,166,0.28)");
  });
});

describe("multiCategorySelectionCap", () => {
  const cats = [
    { id: "a", maxPerOrder: 10, available: 100 },
    { id: "b", maxPerOrder: 10, available: 200 },
    { id: "c", maxPerOrder: 10, available: 50 },
    { id: "d", maxPerOrder: 10, available: 50 },
  ];

  it("does not sum all category caps when nothing is selected", () => {
    expect(multiCategorySelectionCap(cats, {})).toBe(10);
  });

  it("sums caps only for categories with a current selection", () => {
    expect(
      multiCategorySelectionCap(cats, { a: ["s1"], b: ["s2", "s3"] }),
    ).toBe(20);
  });
});
