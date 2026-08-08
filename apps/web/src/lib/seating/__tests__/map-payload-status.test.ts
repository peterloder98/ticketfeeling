import { describe, expect, it } from "vitest";
import { toPublicSeatStatus } from "@/lib/seating/public-seat-status";

describe("toPublicSeatStatus", () => {
  const viewer = new Set(["cart-item-1"]);

  it("marks held seats for the viewer cart as held_by_you", () => {
    expect(
      toPublicSeatStatus(
        { status: "held", cartItemId: "cart-item-1", locked: false },
        viewer,
      ),
    ).toBe("held_by_you");
  });

  it("marks held seats for other carts as held (not sold)", () => {
    expect(
      toPublicSeatStatus(
        { status: "held", cartItemId: "other-item", locked: false },
        viewer,
      ),
    ).toBe("held");
  });

  it("marks held seats without cartItemId as held", () => {
    expect(
      toPublicSeatStatus({ status: "held", cartItemId: null, locked: false }, viewer),
    ).toBe("held");
  });

  it("treats expired holds as available without waiting for expire jobs", () => {
    const now = new Date("2026-08-08T10:00:00.000Z");
    expect(
      toPublicSeatStatus(
        {
          status: "held",
          cartItemId: "other-item",
          locked: false,
          holdExpiresAt: new Date("2026-08-08T09:59:00.000Z"),
        },
        viewer,
        now,
      ),
    ).toBe("available");
  });

  it("keeps unexpired holds as held", () => {
    const now = new Date("2026-08-08T10:00:00.000Z");
    expect(
      toPublicSeatStatus(
        {
          status: "held",
          cartItemId: "other-item",
          locked: false,
          holdExpiresAt: new Date("2026-08-08T10:05:00.000Z"),
        },
        viewer,
        now,
      ),
    ).toBe("held");
  });
});
