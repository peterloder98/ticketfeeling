import { describe, expect, it } from "vitest";
import {
  assertSufficientStock,
  categoryInventoryCapacity,
  channelAvailableQuantity,
  InsufficientStockError,
  sharedRemainingQuantity,
} from "@/lib/commerce/inventory-availability";
import {
  isPlanBackedTicketCategory,
  resolveSellableCategoryCapacity,
} from "@/lib/seating/sync-category-capacity";

const pools = (
  online: { capacity: number; sold: number; held?: number },
  box: { capacity: number; sold: number; held?: number },
) => [
  {
    channel: "online",
    capacity: online.capacity,
    soldQuantity: online.sold,
    heldQuantity: online.held ?? 0,
  },
  {
    channel: "box_office",
    capacity: box.capacity,
    soldQuantity: box.sold,
    heldQuantity: box.held ?? 0,
  },
];

describe("inventory-availability (shared channel pools)", () => {
  it("does not invent stock when category capacity is 0", () => {
    expect(categoryInventoryCapacity(50)).toBe(
      50,
    );
    // Stale pool caps must not override an empty Kontingent (unassigned Stehplatz).
    expect(categoryInventoryCapacity(0)).toBe(
      0,
    );
    expect(sharedRemainingQuantity(pools({ capacity: 50, sold: 0 }, { capacity: 50, sold: 0 }), 0)).toBe(0);
    expect(channelAvailableQuantity(pools({ capacity: 50, sold: 0 }, { capacity: 50, sold: 0 }), "online", 0)).toBe(
      0,
    );
  });

  it("heals stale zero pool capacity when Kontingent is positive", () => {
    const p = pools({ capacity: 0, sold: 0 }, { capacity: 0, sold: 0 });
    expect(channelAvailableQuantity(p, "online", 64)).toBe(64);
    expect(channelAvailableQuantity(p, "box_office", 64)).toBe(64);
  });

  it("shared remaining treats Online + Tageskasse as one Kontingent", () => {
    const p = pools({ capacity: 50, sold: 0 }, { capacity: 50, sold: 0 });
    expect(sharedRemainingQuantity(p, 50)).toBe(50);
    expect(channelAvailableQuantity(p, "online", 50)).toBe(50);
    expect(channelAvailableQuantity(p, "box_office", 50)).toBe(50);
  });

  it("blocks oversell when the other channel already sold", () => {
    const p = pools({ capacity: 50, sold: 50 }, { capacity: 50, sold: 0 });
    expect(sharedRemainingQuantity(p, 50)).toBe(0);
    expect(channelAvailableQuantity(p, "online", 50)).toBe(0);
    expect(channelAvailableQuantity(p, "box_office", 50)).toBe(0);
  });

  it("respects optional channel caps that sum ≤ physical", () => {
    const p = pools({ capacity: 30, sold: 0 }, { capacity: 20, sold: 0 });
    expect(channelAvailableQuantity(p, "online", 50)).toBe(30);
    expect(channelAvailableQuantity(p, "box_office", 50)).toBe(20);
    const afterOnline = pools({ capacity: 30, sold: 30 }, { capacity: 20, sold: 0 });
    expect(channelAvailableQuantity(afterOnline, "box_office", 50)).toBe(20);
    expect(channelAvailableQuantity(afterOnline, "online", 50)).toBe(0);
  });

  it("counts holds toward shared committed", () => {
    const p = pools({ capacity: 50, sold: 10, held: 15 }, { capacity: 50, sold: 5 });
    expect(sharedRemainingQuantity(p, 50)).toBe(20);
    expect(channelAvailableQuantity(p, "box_office", 50)).toBe(20);
  });

  it("assertSufficientStock exposes remaining for race UX", () => {
    expect(() => assertSufficientStock(0, 2)).toThrow(InsufficientStockError);
    try {
      assertSufficientStock(3, 5);
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientStockError);
      expect((e as InsufficientStockError).message).toBe("INSUFFICIENT_STOCK");
      expect((e as InsufficientStockError).available).toBe(3);
    }
    expect(() => assertSufficientStock(5, 2)).not.toThrow();
  });
});

describe("standing / plan-backed capacity", () => {
  it("treats Stehplatz as plan-backed only when seating is on", () => {
    expect(
      isPlanBackedTicketCategory({
        categoryKind: "standing",
        freeSeating: true,
        seatingEnabled: true,
      }),
    ).toBe(true);
    expect(
      isPlanBackedTicketCategory({
        categoryKind: "standing",
        freeSeating: true,
        seatingBookingMode: "seat_map_and_best",
      }),
    ).toBe(true);
    expect(
      isPlanBackedTicketCategory({
        categoryKind: "standing",
        freeSeating: true,
        seatingBookingMode: "none",
      }),
    ).toBe(false);
    expect(
      isPlanBackedTicketCategory({
        categoryKind: "standing",
        freeSeating: true,
        seatingEnabled: false,
      }),
    ).toBe(false);
  });

  it("uses assigned seat count over stale wizard capacity", () => {
    expect(
      resolveSellableCategoryCapacity({
        categoryCapacity: 100,
        categoryKind: "standing",
        freeSeating: true,
        seatingBookingMode: "seat_map_and_best",
        assignedUnlockedSeatCount: 0,
      }),
    ).toBe(0);
    expect(
      resolveSellableCategoryCapacity({
        categoryCapacity: 100,
        categoryKind: "standing",
        freeSeating: true,
        seatingBookingMode: "seat_map_and_best",
        assignedUnlockedSeatCount: 12,
      }),
    ).toBe(12);
  });
});
