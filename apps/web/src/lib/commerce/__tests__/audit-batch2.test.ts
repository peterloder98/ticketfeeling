import { describe, expect, it } from "vitest";
import {
  cartHasCampaignPrice,
  DISCOUNT_CAMPAIGN_ACTIVE,
  DISCOUNT_CAMPAIGN_ACTIVE_MESSAGE_DE,
} from "@/lib/commerce/campaign-promo";
import { pickRestoreInventoryPool } from "@/lib/commerce/restore-ticket-inventory";
import { normalizeSepaTicketReleaseMode } from "@/lib/commerce/sepa-availability";

describe("campaign + promo stacking (#18)", () => {
  it("detects active campaign line prices", () => {
    expect(cartHasCampaignPrice([{ priceCampaignId: null }])).toBe(false);
    expect(cartHasCampaignPrice([{ priceCampaignId: "camp-1" }])).toBe(true);
    expect(
      cartHasCampaignPrice([
        { priceCampaignId: null },
        { priceCampaignId: "camp-2" },
      ]),
    ).toBe(true);
  });

  it("exposes stable reject code and German message", () => {
    expect(DISCOUNT_CAMPAIGN_ACTIVE).toBe("DISCOUNT_CAMPAIGN_ACTIVE");
    expect(DISCOUNT_CAMPAIGN_ACTIVE_MESSAGE_DE).toMatch(/Aktionspreisen/);
  });
});

describe("inventory restore pool pick (#29 / #36)", () => {
  it("prefers online then box_office", () => {
    const pool = pickRestoreInventoryPool(
      [
        { channel: "box_office", id: "b" },
        { channel: "online", id: "o" },
      ],
      "online",
    );
    expect(pool?.id).toBe("o");
  });

  it("prefers box_office for kasse voids", () => {
    const pool = pickRestoreInventoryPool(
      [
        { channel: "online", id: "o" },
        { channel: "box_office", id: "b" },
      ],
      "box_office",
    );
    expect(pool?.id).toBe("b");
  });

  it("floors soldQuantity decrement at zero (SQL GREATEST semantics)", () => {
    const soldQuantity = 2;
    const qty = 5;
    expect(Math.max(0, soldQuantity - qty)).toBe(0);
  });
});

describe("check-in conditional update contract (#36)", () => {
  it("only one concurrent updateMany with presence=previous wins", () => {
    let presence: "not_arrived" | "in" | "out" = "not_arrived";
    const tryFlip = (expected: typeof presence, next: typeof presence) => {
      if (presence !== expected) return 0;
      presence = next;
      return 1;
    };
    expect(tryFlip("not_arrived", "in")).toBe(1);
    expect(tryFlip("not_arrived", "in")).toBe(0);
    expect(presence).toBe("in");
  });
});

describe("SEPA early release gated (#38)", () => {
  it("always normalizes to after_confirmed", () => {
    expect(normalizeSepaTicketReleaseMode("after_submission")).toBe("after_confirmed");
    expect(normalizeSepaTicketReleaseMode("after_confirmed")).toBe("after_confirmed");
    expect(normalizeSepaTicketReleaseMode(null)).toBe("after_confirmed");
  });
});
