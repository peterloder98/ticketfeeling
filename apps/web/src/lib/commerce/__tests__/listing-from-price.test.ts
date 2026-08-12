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
    expect(from?.saleDisclaimer).toBeNull();
    expect(from?.campaignName).toBe("Frühbucher");
    expect(from?.priceLabel).toContain("80,00");
    expect(from?.listPriceLabel).toContain("100,00");
  });

  it("shows order-threshold badge without lowering unit price", () => {
    const map = new Map([
      [
        "ev1",
        [
          campaign({
            id: "pair",
            name: "10 € sparen",
            type: "fixed",
            value: 1000,
            applyMode: "order",
            minQuantity: 2,
            badgeLabel: "10 € sparen",
            badgeDisclaimer: "* beim Kauf von 2 Tickets",
            categoryIds: ["cat-a"],
          }),
        ],
      ],
    ]);
    const from = resolveListingFromPrice({
      categories: [{ id: "cat-a", eventId: "ev1", priceGrossCents: 4900 }],
      campaignsByEventId: map,
      feeConfig: feeOff,
      formatEuro: (c) => `${(c / 100).toFixed(2).replace(".", ",")} €`,
      now,
    });
    expect(from?.unitCents).toBe(4900);
    expect(from?.listPriceLabel).toBeNull();
    expect(from?.saleBadge).toBe("10 € sparen");
    expect(from?.saleDisclaimer).toBe("* beim Kauf von 2 Tickets");
    expect(from?.campaignName).toBe("10 € sparen");
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

  it("keeps ticket from-price and zzgl. 4 % Verwaltungsgebühr when fee is on", () => {
    const from = resolveListingFromPrice({
      categories: [{ id: "cat-a", eventId: "ev1", priceGrossCents: 10000 }],
      campaignsByEventId: new Map([["ev1", []]]),
      feeConfig: {
        enabled: true,
        percentageBasisPoints: 400,
        displayName: "Verwaltungsgebühr",
      },
      formatEuro: (c) => `${(c / 100).toFixed(2).replace(".", ",")} €`,
      now,
    });
    expect(from?.priceLabel).toBe("ab 100,00 €");
    expect(from?.surchargeLabel).toBe("zzgl. 4 % Verwaltungsgebühr");
    expect(from?.unitCents).toBe(10000);
  });
});
