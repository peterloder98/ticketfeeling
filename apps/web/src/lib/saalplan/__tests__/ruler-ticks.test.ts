import { describe, expect, it } from "vitest";
import {
  adaptiveMeterTickStepCm,
  cmToMetersTickLabel,
} from "@/lib/saalplan/types";

describe("adaptiveMeterTickStepCm", () => {
  it("uses 1 m ticks when labels fit", () => {
    // 0.6 px/cm → 60 px/m — 1 m labels clear the 56 px min gap
    expect(adaptiveMeterTickStepCm(0.6, 56)).toBe(100);
  });

  it("sparsifies when zoomed out", () => {
    // 0.2 px/cm → 20 px/m — need ≥ 5 m steps for 56 px gap
    expect(adaptiveMeterTickStepCm(0.2, 56)).toBe(500);
  });

  it("allows half-meter ticks when very zoomed in", () => {
    // 1.2 px/cm → 120 px/m
    expect(adaptiveMeterTickStepCm(1.2, 56)).toBe(50);
  });

  it("steps up to 2 m when 1 m would collide", () => {
    // 0.5 px/cm → 50 px/m — 1 m is only 50 px apart (< 56)
    expect(adaptiveMeterTickStepCm(0.5, 56)).toBe(200);
  });
});

describe("cmToMetersTickLabel", () => {
  it("shows unit only when requested", () => {
    expect(cmToMetersTickLabel(0, true)).toBe("0 m");
    expect(cmToMetersTickLabel(1000, false)).toBe("10");
    expect(cmToMetersTickLabel(1000, true)).toBe("10 m");
  });
});
