import { describe, expect, it } from "vitest";
import {
  isSeatBookable,
  isSeatHeldByOwner,
  isHoldExpired,
  isActiveHold,
  seatUnbookableToErrorCode,
  sellableSeatPrismaWhere,
} from "@/lib/seating/is-seat-bookable";
import { cartErrorMessage } from "@/lib/commerce/cart-error-messages";

const base = {
  id: "s1",
  status: "available",
  locked: false,
  categoryId: "cat-a",
  seatType: "standard",
  seatKey: "A:R1:S1",
  cartItemId: null as string | null,
  holdExpiresAt: null as Date | null,
};

describe("isSeatBookable — hard constraints", () => {
  it("A: sold seats are never bookable", () => {
    const r = isSeatBookable({ ...base, status: "sold" });
    expect(r).toEqual({ ok: false, reason: "sold" });
  });

  it("B: locked seats are never bookable", () => {
    const r = isSeatBookable({ ...base, locked: true });
    expect(r).toEqual({ ok: false, reason: "locked" });
  });

  it("C: held by other cart blocks booking", () => {
    const r = isSeatBookable(
      {
        ...base,
        status: "held",
        cartItemId: "other-item",
        holdExpiresAt: new Date(Date.now() + 60_000),
      },
      { ownerCartItemId: "my-item" },
    );
    expect(r).toEqual({ ok: false, reason: "held_by_other" });
  });

  it("D: own active hold reports held_by_you (not a fresh claim)", () => {
    const r = isSeatBookable(
      {
        ...base,
        status: "held",
        cartItemId: "my-item",
        holdExpiresAt: new Date(Date.now() + 60_000),
      },
      { ownerCartItemId: "my-item" },
    );
    expect(r).toEqual({ ok: false, reason: "held_by_you" });
  });

  it("E: expired hold is reclaimable when allowed", () => {
    const r = isSeatBookable(
      {
        ...base,
        status: "held",
        cartItemId: "other-item",
        holdExpiresAt: new Date(Date.now() - 1_000),
      },
      { allowExpiredHoldReclaim: true },
    );
    expect(r).toEqual({ ok: true });
  });

  it("F: expired hold without reclaim flag is not bookable", () => {
    const r = isSeatBookable(
      {
        ...base,
        status: "held",
        cartItemId: "other-item",
        holdExpiresAt: new Date(Date.now() - 1_000),
      },
      { allowExpiredHoldReclaim: false },
    );
    expect(r.ok).toBe(false);
  });

  it("G: wrong category is rejected when assignments required", () => {
    const r = isSeatBookable(
      { ...base, categoryId: "cat-b" },
      { expectedCategoryId: "cat-a", requireCategoryMatch: true },
    );
    expect(r).toEqual({ ok: false, reason: "wrong_category" });
  });

  it("H: wheelchair seat type restriction", () => {
    const bad = isSeatBookable(
      { ...base, seatType: "companion" },
      { allowedSeatTypes: ["wheelchair"] },
    );
    expect(bad).toEqual({ ok: false, reason: "wrong_seat_type" });
    const ok = isSeatBookable(
      { ...base, seatType: "wheelchair" },
      { allowedSeatTypes: ["wheelchair", "standard"] },
    );
    expect(ok).toEqual({ ok: true });
  });

  it("I: standing excluded when allowStanding false", () => {
    const r = isSeatBookable(
      { ...base, seatKey: "Z:ST:1" },
      { allowStanding: false },
    );
    expect(r).toEqual({ ok: false, reason: "standing_not_allowed" });
  });

  it("J: missing seat", () => {
    expect(isSeatBookable(null)).toEqual({ ok: false, reason: "missing" });
  });

  it("K: available unlocked matching category is bookable", () => {
    expect(
      isSeatBookable(base, {
        expectedCategoryId: "cat-a",
        requireCategoryMatch: true,
      }),
    ).toEqual({ ok: true });
  });
});

describe("isSeatHeldByOwner / expire vs sold", () => {
  it("L: owner keep requires active held + matching cartItemId", () => {
    expect(
      isSeatHeldByOwner(
        {
          ...base,
          status: "held",
          cartItemId: "item-1",
          holdExpiresAt: new Date(Date.now() + 60_000),
        },
        "item-1",
      ),
    ).toBe(true);
  });

  it("M: sold is never an active owner hold (expire must not free sold)", () => {
    expect(
      isSeatHeldByOwner(
        { ...base, status: "sold", cartItemId: "item-1" },
        "item-1",
      ),
    ).toBe(false);
    // Policy: sold never reclaimable
    expect(
      isSeatBookable(
        { ...base, status: "sold", holdExpiresAt: new Date(0) },
        { allowExpiredHoldReclaim: true },
      ),
    ).toEqual({ ok: false, reason: "sold" });
  });

  it("N: expired hold is not held by owner", () => {
    const seat = {
      ...base,
      status: "held" as const,
      cartItemId: "item-1",
      holdExpiresAt: new Date(Date.now() - 5_000),
    };
    expect(isHoldExpired(seat)).toBe(true);
    expect(isActiveHold(seat)).toBe(false);
    expect(isSeatHeldByOwner(seat, "item-1")).toBe(false);
  });
});

describe("sellableSeatPrismaWhere + error mapping", () => {
  it("O: sellable where includes soft-expired holds, never sold", () => {
    const now = new Date("2026-08-08T10:00:00Z");
    const where = sellableSeatPrismaWhere({
      eventId: "evt",
      categoryId: "cat-a",
      now,
    });
    expect(where.locked).toBe(false);
    expect(where.categoryId).toBe("cat-a");
    expect(where.OR).toEqual([
      { status: "available" },
      { status: "held", holdExpiresAt: { lt: now } },
    ]);
    expect(JSON.stringify(where)).not.toContain("sold");
  });

  it("maps unbookable reasons to SEATS_UNAVAILABLE (not SOLD_OUT jargon)", () => {
    expect(seatUnbookableToErrorCode("sold")).toBe("SEATS_UNAVAILABLE");
    expect(seatUnbookableToErrorCode("held_by_other")).toBe("SEATS_UNAVAILABLE");
  });
});

describe("German conflict UX copy", () => {
  it("singular / plural / selection-updated variants", () => {
    expect(cartErrorMessage("SEATS_UNAVAILABLE")).toBe(
      "Ein ausgewählter Platz ist leider gerade nicht mehr verfügbar.",
    );
    expect(cartErrorMessage("SEATS_UNAVAILABLE", { unavailableCount: 3 })).toBe(
      "Mehrere ausgewählte Plätze sind leider gerade nicht mehr verfügbar.",
    );
    expect(
      cartErrorMessage("SEATS_UNAVAILABLE", {
        unavailableCount: 1,
        selectionUpdated: true,
      }),
    ).toContain("Wir haben deine Auswahl aktualisiert");
    expect(cartErrorMessage("SEATS_UNAVAILABLE")).not.toMatch(/409|Conflict/i);
    expect(cartErrorMessage("SOLD_OUT")).toBe("Leider ausverkauft.");
  });
});
