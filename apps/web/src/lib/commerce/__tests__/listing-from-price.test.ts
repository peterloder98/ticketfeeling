import { describe, expect, it } from "vitest";
import { resolveListingFromPrice } from "@/lib/commerce/listing-from-price";
import type { PriceCampaignInput } from "@/lib/commerce/event-pricing";

const feeOff = {
  enabled: false,
  percentageBasisPoints: 0,
  displayName: "Gebühr",
};

const now = new Date("2026-08-06T12:00:00.000Z");

function campaign(partial: Partial<PriceCampaignInput> & Pick<PriceCampaignInput, "id" | "name" | "value" | "type">): PriceCampaignInput {
  return {
    active: true,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T23:59:59.000Z"),
    channels: "both",
    categoryIds: ["cat-a"],
    ...partial,
  };
}

describe("resolveListingFromPrice", () => {
  it("applies campaign to from-price and exposes Aktion badge", () => {
    const map = new Map([
      [
        "ev1",
        [
          campaign({
            id: "early",
            name: "Frühbucher",
            type: "percent",
            value: 2000,
            categoryIds: ["cat-a"],
          }),
        ],
      ],
    ]);
    const from = resolveListingFromPrice({
      categories: [
        { id: "cat-a", eventId: "ev1", priceGrossCents: 10000 },
        { id: "cat-b", eventId: "ev1", priceGrossCents: 12000 },
      ],
      campaignsByEventId: map,
      feeConfig: feeOff,
      formatEuro: (c) => `${(c / 100).toFixed(2).replace(".", ",")} €`,
      now,
    });
    expect(from?.unitCents).toBe(8000);
    expect(from?.listCents).toBe(10000);
    expect(from?.saleBadge).toBe("−20%");
    expect(from?.campaignName).toBe("Frühbucher");
    expect(from?.priceLabel).toContain("80,00");
    expect(from?.listPriceLabel).toContain("100,00");
  });

  it("returns plain from-price without campaign", () => {
    const from = resolveListingFromPrice({
      categories: [{ id: "cat-a", eventId: "ev1", priceGrossCents: 5000 }],
      campaignsByEventId: new Map([["ev1", []]]),
      feeConfig: feeOff,
      formatEuro: (c) => `${c}`,
      now,
    });
    expect(from?.saleBadge).toBeNull();
    expect(from?.listPriceLabel).toBeNull();
    expect(from?.unitCents).toBe(5000);
  });
});
