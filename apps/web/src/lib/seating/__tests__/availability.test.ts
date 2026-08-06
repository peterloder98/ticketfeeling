import { describe, expect, it } from "vitest";
import {
  countSellableAvailableSeats,
  multiCategorySelectionCap,
} from "@/lib/seating/availability";

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
