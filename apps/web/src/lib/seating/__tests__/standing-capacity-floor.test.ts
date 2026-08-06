import { describe, expect, it } from "vitest";
import { sharedCommittedQuantity } from "@/lib/commerce/inventory-availability";

/** Mirror of floor used by adjustStandingCategoryCapacity (sold+held vs protected seats). */
function standingCapacityFloor(input: {
  pools: { soldQuantity: number; heldQuantity: number; capacity: number }[];
  protectedSeatCount: number;
}) {
  return Math.max(sharedCommittedQuantity(input.pools), input.protectedSeatCount);
}

describe("standing category capacity floor", () => {
  it("uses shared Online+Tageskasse sold+held as floor", () => {
    const floor = standingCapacityFloor({
      pools: [
        { soldQuantity: 40, heldQuantity: 5, capacity: 100 },
        { soldQuantity: 10, heldQuantity: 0, capacity: 100 },
      ],
      protectedSeatCount: 0,
    });
    expect(floor).toBe(55);
  });

  it("never goes below non-available standing seats", () => {
    const floor = standingCapacityFloor({
      pools: [
        { soldQuantity: 10, heldQuantity: 0, capacity: 100 },
        { soldQuantity: 0, heldQuantity: 0, capacity: 100 },
      ],
      protectedSeatCount: 18,
    });
    expect(floor).toBe(18);
  });

  it("allows increase above current freely (floor only constrains decrease)", () => {
    const floor = standingCapacityFloor({
      pools: [
        { soldQuantity: 0, heldQuantity: 0, capacity: 50 },
        { soldQuantity: 0, heldQuantity: 0, capacity: 50 },
      ],
      protectedSeatCount: 0,
    });
    expect(floor).toBe(0);
    expect(120 >= floor).toBe(true);
  });
});
