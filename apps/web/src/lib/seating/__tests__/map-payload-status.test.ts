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

  it("marks held seats for other carts as taken", () => {
    expect(
      toPublicSeatStatus(
        { status: "held", cartItemId: "other-item", locked: false },
        viewer,
      ),
    ).toBe("taken");
  });

  it("marks held seats without cartItemId as taken", () => {
    expect(
      toPublicSeatStatus({ status: "held", cartItemId: null, locked: false }, viewer),
    ).toBe("taken");
  });

  it("keeps available / sold / locked", () => {
    expect(
      toPublicSeatStatus({ status: "available", cartItemId: null, locked: false }, viewer),
    ).toBe("available");
    expect(
      toPublicSeatStatus({ status: "sold", cartItemId: null, locked: false }, viewer),
    ).toBe("taken");
    expect(
      toPublicSeatStatus({ status: "available", cartItemId: null, locked: true }, viewer),
    ).toBe("locked");
  });
});
