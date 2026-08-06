import { describe, expect, it } from "vitest";
import {
  mapSlotKeysToCategoryIds,
  paintBlockCategory,
  paintRowCategory,
  paintSeatCategory,
  parsePlanCategorySlots,
  resolveSeatCategoryKey,
  slotKeyFromName,
  stripPlanCategoryPaint,
} from "@/lib/saalplan/category-slots";
import type { VenuePlanObject } from "@/lib/saalplan/types";

function block(partial: Partial<VenuePlanObject> = {}): VenuePlanObject {
  return {
    id: "obj_a",
    type: "seat_block",
    xCm: 0,
    yCm: 0,
    widthCm: 500,
    heightCm: 400,
    rotationDeg: 0,
    rows: 5,
    seatsPerRow: 10,
    numberedSeats: true,
    ...partial,
  };
}

describe("category slots", () => {
  it("parses slots and builds stable keys", () => {
    expect(slotKeyFromName("Parkett")).toBe("parkett");
    const slots = parsePlanCategorySlots([
      { name: "Parkett", color: "#14B8A6" },
      { key: "rang", name: "Rang", color: "#0F2747" },
    ]);
    expect(slots).toHaveLength(2);
    expect(slots[0]!.key).toBe("parkett");
    expect(slots[1]!.key).toBe("rang");
  });

  it("resolves seat → row → block precedence", () => {
    const b = block({
      categoryKey: "parkett",
      rowCategoryKeys: { "2": "rang" },
      seatCategoryKeys: { "R2:S3": "vip" },
    });
    expect(resolveSeatCategoryKey(b, 1, 1)).toBe("parkett");
    expect(resolveSeatCategoryKey(b, 2, 1)).toBe("rang");
    expect(resolveSeatCategoryKey(b, 2, 3)).toBe("vip");
  });

  it("maps slot names to event categories", () => {
    const slots = parsePlanCategorySlots([
      { key: "parkett", name: "Parkett", color: "#14B8A6" },
      { key: "rang", name: "Rang", color: "#0F2747" },
    ]);
    const map = mapSlotKeysToCategoryIds(slots, [
      { id: "cat-1", name: "Parkett" },
      { id: "cat-2", name: "rang" },
    ]);
    expect(map.get("parkett")).toBe("cat-1");
    expect(map.get("rang")).toBe("cat-2");
  });

  it("paint helpers clear more-specific overrides", () => {
    let b = block({
      categoryKey: "a",
      rowCategoryKeys: { "1": "b" },
      seatCategoryKeys: { "R1:S1": "c" },
    });
    b = paintBlockCategory(b, "parkett");
    expect(b.categoryKey).toBe("parkett");
    expect(b.rowCategoryKeys).toBeUndefined();
    expect(b.seatCategoryKeys).toBeUndefined();

    b = paintRowCategory(b, 1, "rang");
    expect(b.rowCategoryKeys?.["1"]).toBe("rang");
    b = paintSeatCategory(b, 1, 2, "vip");
    expect(b.seatCategoryKeys?.["R1:S2"]).toBe("vip");
    expect(resolveSeatCategoryKey(b, 1, 2)).toBe("vip");
    expect(resolveSeatCategoryKey(b, 1, 3)).toBe("rang");
  });

  it("stripPlanCategoryPaint clears seat_block paint and leaves standing alone", () => {
    const painted = block({
      categoryKey: "parkett",
      rowCategoryKeys: { "1": "rang" },
      seatCategoryKeys: { "R1:S1": "vip" },
    });
    const stripped = stripPlanCategoryPaint(painted);
    expect(stripped.categoryKey).toBeUndefined();
    expect(stripped.rowCategoryKeys).toBeUndefined();
    expect(stripped.seatCategoryKeys).toBeUndefined();

    const standing: VenuePlanObject = {
      id: "stand_1",
      type: "standing_area",
      xCm: 0,
      yCm: 0,
      widthCm: 400,
      heightCm: 200,
      rotationDeg: 0,
      label: "Stehbereich",
      standingMode: "standing",
      capacity: 16,
      capacityManual: false,
    };
    expect(stripPlanCategoryPaint(standing)).toEqual(standing);
  });
});
