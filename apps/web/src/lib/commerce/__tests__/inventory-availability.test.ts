import { describe, expect, it } from "vitest";
import {
  categoryInventoryCapacity,
  channelAvailableQuantity,
  sharedRemainingQuantity,
} from "@/lib/commerce/inventory-availability";

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
  it("does not sum channel pool capacities", () => {
    expect(categoryInventoryCapacity(50, pools({ capacity: 50, sold: 0 }, { capacity: 50, sold: 0 }))).toBe(
      50,
    );
    expect(categoryInventoryCapacity(0, pools({ capacity: 50, sold: 0 }, { capacity: 50, sold: 0 }))).toBe(
      50,
    );
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
});
