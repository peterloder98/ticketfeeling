import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_ZOOM,
  MAX_VIEW_ZOOM,
  fitViewZoom,
  readableScalePxPerCm,
} from "@/lib/saalplan/view-zoom";

describe("view-zoom", () => {
  it("defines 100% as readable seat scale, not fit", () => {
    const readable = readableScalePxPerCm();
    // Large hall fit is much smaller than readable.
    const fitScale = 720 / 2000;
    const fitZ = fitViewZoom(fitScale, readable);
    expect(fitZ).toBeLessThan(DEFAULT_VIEW_ZOOM);
    expect(readable * DEFAULT_VIEW_ZOOM).toBeGreaterThan(fitScale);
  });

  it("allows zooming well past former 400% fit cap", () => {
    expect(MAX_VIEW_ZOOM).toBeGreaterThanOrEqual(6);
    const readable = readableScalePxPerCm();
    expect(readable * MAX_VIEW_ZOOM).toBeGreaterThan(readable * 4);
  });
});
