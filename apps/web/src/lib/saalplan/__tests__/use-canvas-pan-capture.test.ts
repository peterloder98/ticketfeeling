import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: early setPointerCapture on the scroll container retargets
 * click away from seats when panOverInteractive is enabled (public Saalplan).
 * Capture must only happen after the pan movement threshold.
 */
describe("useCanvasPan pointer capture", () => {
  it("defers setPointerCapture until after pan threshold (not on pointerdown)", () => {
    const src = readFileSync(
      resolve(__dirname, "../use-canvas-pan.ts"),
      "utf8",
    );
    const downIdx = src.indexOf("const onPointerDown");
    const moveIdx = src.indexOf("const onPointerMove");
    const upIdx = src.indexOf("const onPointerUp");
    expect(downIdx).toBeGreaterThan(-1);
    expect(moveIdx).toBeGreaterThan(downIdx);
    expect(upIdx).toBeGreaterThan(moveIdx);

    const pointerDownBody = src.slice(downIdx, moveIdx);
    const pointerMoveBody = src.slice(moveIdx, upIdx);
    const callRe = /\.setPointerCapture\s*\(/;

    expect(pointerDownBody).not.toMatch(callRe);
    expect(pointerMoveBody).toMatch(callRe);
    expect(pointerMoveBody).toMatch(/PAN_THRESHOLD_PX/);
    expect(src).toMatch(/panOverInteractive/);
  });
});
