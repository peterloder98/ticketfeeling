import { describe, expect, it } from "vitest";
import {
  estimateStandingCapacity,
  parseVenuePlanObjects,
  resolveStandingCapacity,
  standingSeatKey,
} from "@/lib/saalplan/types";
import { createStandingArea } from "@/lib/saalplan/snap";

describe("standing capacity", () => {
  it("estimates from area and density", () => {
    // 8m × 4m = 32 m² × 2.0 = 64
    expect(estimateStandingCapacity(800, 400, "standing")).toBe(64);
    // tables: 1.0 / m²
    expect(estimateStandingCapacity(800, 400, "standing_tables")).toBe(32);
  });

  it("createStandingArea seeds capacity from estimate", () => {
    const area = createStandingArea(2000, 1500);
    expect(area.type).toBe("standing_area");
    expect(area.capacityManual).toBe(false);
    expect(area.capacity).toBe(
      estimateStandingCapacity(area.widthCm, area.heightCm, area.standingMode ?? "standing"),
    );
  });

  it("resolveStandingCapacity prefers persisted override", () => {
    const area = createStandingArea(2000, 1500);
    const auto = resolveStandingCapacity(area);
    expect(resolveStandingCapacity({ ...area, capacity: auto + 10, capacityManual: true })).toBe(
      auto + 10,
    );
    expect(resolveStandingCapacity({ ...area, capacity: Math.max(0, auto - 5) })).toBe(
      Math.max(0, auto - 5),
    );
  });

  it("parseVenuePlanObjects backfills capacity for legacy standing areas", () => {
    const parsed = parseVenuePlanObjects([
      {
        id: "st1",
        type: "standing_area",
        xCm: 100,
        yCm: 100,
        widthCm: 800,
        heightCm: 400,
        rotationDeg: 0,
        standingMode: "standing",
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.capacity).toBe(64);
    expect(parsed[0]!.capacityManual).toBe(false);
  });

  it("parse keeps manual capacity", () => {
    const parsed = parseVenuePlanObjects([
      {
        id: "st1",
        type: "standing_area",
        xCm: 100,
        yCm: 100,
        widthCm: 800,
        heightCm: 400,
        rotationDeg: 0,
        standingMode: "standing",
        capacity: 120,
        capacityManual: true,
      },
    ]);
    expect(parsed[0]!.capacity).toBe(120);
    expect(parsed[0]!.capacityManual).toBe(true);
    expect(resolveStandingCapacity(parsed[0]!)).toBe(120);
  });

  it("standingSeatKey is stable", () => {
    expect(standingSeatKey("obj_a", 3)).toBe("obj_a:ST:3");
  });
});
