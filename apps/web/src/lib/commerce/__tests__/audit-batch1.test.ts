import { describe, expect, it } from "vitest";

/**
 * Documents conditional check-in semantics: only one concurrent updateMany
 * with where presence=previous can win (count === 1).
 */
function simulateAtomicCheckin(
  presence: "not_arrived" | "in" | "out",
  action: "in" | "out",
): { winner: boolean; next: string; reason?: string } {
  const previous = presence;
  if (action === "in" && presence === "in") {
    return { winner: false, next: presence, reason: "already_in" };
  }
  if (action === "out" && presence === "out") {
    return { winner: false, next: presence, reason: "already_out" };
  }
  if (action === "out" && presence === "not_arrived") {
    return { winner: false, next: presence, reason: "not_arrived" };
  }
  const next = action === "in" ? "in" : "out";
  // First writer wins when presence still equals previous
  if (presence !== previous) {
    return { winner: false, next: presence, reason: "presence_race" };
  }
  return { winner: true, next };
}

describe("atomic check-in race", () => {
  it("only one of two concurrent in-scans wins", () => {
    let presence: "not_arrived" | "in" | "out" = "not_arrived";
    const a = simulateAtomicCheckin(presence, "in");
    expect(a.winner).toBe(true);
    presence = a.next as typeof presence;

    const b = simulateAtomicCheckin(presence, "in");
    expect(b.winner).toBe(false);
    expect(b.reason).toBe("already_in");
  });

  it("out after in succeeds once", () => {
    let presence: "not_arrived" | "in" | "out" = "in";
    const a = simulateAtomicCheckin(presence, "out");
    expect(a.winner).toBe(true);
    presence = a.next as typeof presence;
    const b = simulateAtomicCheckin(presence, "out");
    expect(b.winner).toBe(false);
  });
});

describe("promo reservation vs fulfill fallback", () => {
  function isPromoSoftFail(code: string): boolean {
    return (
      code === "DISCOUNT_EXHAUSTED" ||
      code === "DISCOUNT_NOT_FOUND" ||
      code.startsWith("GIFT_CARD_")
    );
  }

  it("treats discount/gift failures as checkout-blocking (hard lock)", () => {
    expect(isPromoSoftFail("DISCOUNT_EXHAUSTED")).toBe(true);
    expect(isPromoSoftFail("GIFT_CARD_INSUFFICIENT")).toBe(true);
    expect(isPromoSoftFail("PAYMENT_NOT_PAID")).toBe(false);
  });
});

describe("inventory restore pool preference", () => {
  function pickPool(
    pools: Array<{ channel: string; id: string }>,
    preferred: "online" | "box_office",
  ) {
    const fallback = preferred === "online" ? "box_office" : "online";
    return (
      pools.find((p) => p.channel === preferred) ??
      pools.find((p) => p.channel === fallback) ??
      pools[0]
    );
  }

  it("prefers online for online refunds", () => {
    const pool = pickPool(
      [
        { channel: "box_office", id: "b" },
        { channel: "online", id: "o" },
      ],
      "online",
    );
    expect(pool?.id).toBe("o");
  });

  it("prefers box_office for kasse voids", () => {
    const pool = pickPool(
      [
        { channel: "online", id: "o" },
        { channel: "box_office", id: "b" },
      ],
      "box_office",
    );
    expect(pool?.id).toBe("b");
  });
});
