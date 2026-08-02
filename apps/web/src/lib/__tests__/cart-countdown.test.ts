import { describe, expect, it } from "vitest";
import {
  CART_REMIND_AT_MS,
  formatCountdown,
  getCartCountdownState,
} from "@/lib/cart-countdown";

describe("cart-countdown", () => {
  it("formats mm:ss", () => {
    expect(formatCountdown(10 * 60 * 1000)).toBe("10:00");
    expect(formatCountdown(5 * 60 * 1000 + 1000)).toBe("05:01");
    expect(formatCountdown(59_000)).toBe("00:59");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("marks urgent at 5 minutes and critical at 2", () => {
    const end = new Date("2026-07-31T12:10:00.000Z");
    const atFive = getCartCountdownState(end, end.getTime() - CART_REMIND_AT_MS.fiveMinutes);
    expect(atFive?.urgent).toBe(true);
    expect(atFive?.critical).toBe(false);
    expect(atFive?.label).toBe("05:00");

    const atTwo = getCartCountdownState(end, end.getTime() - CART_REMIND_AT_MS.twoMinutes);
    expect(atTwo?.critical).toBe(true);
    expect(atTwo?.label).toBe("02:00");
  });

  it("ticks down between seconds", () => {
    const end = new Date("2026-07-31T12:10:00.000Z");
    const a = getCartCountdownState(end, end.getTime() - 90_500);
    const b = getCartCountdownState(end, end.getTime() - 89_400);
    expect(a?.label).toBe("01:31");
    expect(b?.label).toBe("01:30");
  });
});
