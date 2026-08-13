import { describe, expect, it } from "vitest";
import {
  applyDiscountOff,
  pickBestCampaign,
  resolveOrderCampaignDiscount,
  resolveTicketUnitPrice,
  mapCampaignRow,
  formatOrderCampaignBadge,
  formatCampaignCategoryScopeHint,
  mergeCampaignDisclaimerParts,
  type PriceCampaignInput,
} from "@/lib/commerce/event-pricing";

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

describe("applyDiscountOff", () => {
  it("applies percent bps", () => {
    expect(applyDiscountOff(10000, "percent", 1000)).toBe(9000); // 10%
  });
  it("applies fixed cents", () => {
    expect(applyDiscountOff(10000, "fixed", 1500)).toBe(8500);
  });
  it("never goes below zero", () => {
    expect(applyDiscountOff(500, "fixed", 900)).toBe(0);
  });
});

describe("pickBestCampaign", () => {
  it("picks largest absolute discount when overlapping", () => {
    const best = pickBestCampaign({
      listCents: 10000,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [
        campaign({ id: "p10", name: "10%", type: "percent", value: 1000 }),
        campaign({ id: "f20", name: "20€", type: "fixed", value: 2000 }),
      ],
    });
    expect(best?.id).toBe("f20");
  });

  it("ignores inactive or out-of-window or wrong category", () => {
    const best = pickBestCampaign({
      listCents: 10000,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [
        campaign({ id: "off", name: "off", type: "fixed", value: 5000, active: false }),
        campaign({
          id: "future",
          name: "future",
          type: "fixed",
          value: 5000,
          validFrom: new Date("2027-01-01"),
          validUntil: new Date("2027-02-01"),
        }),
        campaign({
          id: "other",
          name: "other",
          type: "fixed",
          value: 5000,
          categoryIds: ["cat-b"],
        }),
      ],
    });
    expect(best).toBeNull();
  });

  it("applies unit campaign with empty categoryIds (orphan links)", () => {
    const best = pickBestCampaign({
      listCents: 10000,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [
        campaign({
          id: "orphan",
          name: "Sommer-Rabatt",
          type: "percent",
          value: 1000,
          categoryIds: [],
        }),
      ],
    });
    expect(best?.id).toBe("orphan");
  });

  it("treats unit+minQuantity>1 leftover as order — no unit strike", () => {
    const mapped = mapCampaignRow({
      id: "sommer",
      name: "Sommer-Rabatt",
      active: true,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T23:59:59.000Z"),
      type: "fixed",
      value: 1000,
      channels: "both",
      applyMode: "unit",
      minQuantity: 2,
      badgeLabel: "Sommer-Rabatt - 10 EUR sparen",
      badgeDisclaimer: null,
      categories: [{ categoryId: "cat-a" }],
    });
    expect(mapped.applyMode).toBe("order");
    expect(mapped.minQuantity).toBe(2);

    const priced = resolveTicketUnitPrice({
      listCents: 4900,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [mapped],
    });
    expect(priced.unitCents).toBe(4900);
    expect(priced.campaignId).toBeNull();
  });

  it("heals unit + „10 EUR sparen“ badge (after bad minQuantity=1 heal) to order", () => {
    const mapped = mapCampaignRow({
      id: "sommer",
      name: "Sommer-Rabatt",
      active: true,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T23:59:59.000Z"),
      type: "fixed",
      value: 1000,
      channels: "both",
      applyMode: "unit",
      minQuantity: 1,
      badgeLabel: "Sommer-Rabatt - 10 EUR sparen",
      badgeDisclaimer: null,
      categories: [{ categoryId: "cat-a" }],
    });
    expect(mapped.applyMode).toBe("order");
    expect(mapped.minQuantity).toBe(2);
    expect(formatOrderCampaignBadge(mapped)).toBe("10 € Rabatt ab 2 Tickets");
  });

  it("ignores order-mode leftover minQuantity only for unit applyMode", () => {
    const best = pickBestCampaign({
      listCents: 4900,
      categoryId: "cat-a",
      channel: "online",
      now,
      quantity: 1,
      campaigns: [
        campaign({
          id: "pair",
          name: "Pair",
          type: "fixed",
          value: 1000,
          applyMode: "order",
          minQuantity: 2,
          categoryIds: ["cat-a"],
        }),
      ],
    });
    expect(best).toBeNull();
  });

  it("respects channel filter", () => {
    const best = pickBestCampaign({
      listCents: 10000,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [
        campaign({ id: "kasse", name: "Kasse", type: "fixed", value: 3000, channels: "box_office" }),
      ],
    });
    expect(best).toBeNull();
  });
});

describe("resolveTicketUnitPrice", () => {
  it("applies campaign then accessibility on campaign price", () => {
    const resolved = resolveTicketUnitPrice({
      listCents: 10000,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [campaign({ id: "early", name: "Frühbucher", type: "fixed", value: 1000 })],
      accessibility: {
        enabled: true,
        label: "Rollstuhl / Ermäßigt",
        type: "percent",
        value: 1000, // 10% of 9000 = 900
      },
      accessibilitySelected: true,
    });
    expect(resolved.campaignId).toBe("early");
    expect(resolved.campaignName).toBe("Frühbucher");
    expect(resolved.campaignValidUntil).toBe("2026-12-31T23:59:59.000Z");
    expect(resolved.unitCents).toBe(8100);
    expect(resolved.campaignDiscountCents).toBe(1000);
    expect(resolved.accessibilityDiscountCents).toBe(900);
    expect(resolved.accessibilityApplied).toBe(true);
  });

  it("ignores accessibility when offer disabled or not selected", () => {
    const resolved = resolveTicketUnitPrice({
      listCents: 5000,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [],
      accessibility: { enabled: false, label: "X", type: "fixed", value: 1000 },
      accessibilitySelected: true,
    });
    expect(resolved.unitCents).toBe(5000);
    expect(resolved.accessibilityApplied).toBe(false);
  });

  it("ignores order-mode campaigns for unit price", () => {
    const resolved = resolveTicketUnitPrice({
      listCents: 4900,
      categoryId: "cat-a",
      channel: "online",
      now,
      campaigns: [
        campaign({
          id: "pair",
          name: "10 € sparen",
          type: "fixed",
          value: 1000,
          applyMode: "order",
          minQuantity: 2,
        }),
      ],
    });
    expect(resolved.unitCents).toBe(4900);
    expect(resolved.campaignId).toBeNull();
  });
});

describe("resolveOrderCampaignDiscount", () => {
  it("applies 10€ once when eligible qty ≥ 2", () => {
    const campaigns = [
      campaign({
        id: "pair",
        name: "10 € sparen",
        type: "fixed",
        value: 1000,
        applyMode: "order",
        minQuantity: 2,
        badgeLabel: "10 € sparen",
        badgeDisclaimer: "* beim Kauf von 2 Tickets",
      }),
    ];
    const map = new Map([["ev1", campaigns]]);

    expect(
      resolveOrderCampaignDiscount({
        lines: [{ eventId: "ev1", categoryId: "cat-a", quantity: 1, unitGrossCents: 4900 }],
        campaignsByEventId: map,
        channel: "online",
        now,
      }),
    ).toBeNull();

    const applied = resolveOrderCampaignDiscount({
      lines: [{ eventId: "ev1", categoryId: "cat-a", quantity: 2, unitGrossCents: 4900 }],
      campaignsByEventId: map,
      channel: "online",
      now,
    });
    expect(applied?.discountCents).toBe(1000);
    expect(applied?.label).toBe("10 € sparen");
    expect(applied?.badgeDisclaimer).toBe("* beim Kauf von 2 Tickets");

    const three = resolveOrderCampaignDiscount({
      lines: [{ eventId: "ev1", categoryId: "cat-a", quantity: 3, unitGrossCents: 4900 }],
      campaignsByEventId: map,
      channel: "online",
      now,
    });
    expect(three?.discountCents).toBe(1000);
  });

  it("uses campaign name as cart label (amount shown separately)", () => {
    const campaigns = [
      campaign({
        id: "summer",
        name: "Sommer-Rabatt",
        type: "fixed",
        value: 1000,
        applyMode: "order",
        minQuantity: 2,
        badgeLabel: "Sommer-Rabatt - 10 EUR sparen",
      }),
    ];
    const applied = resolveOrderCampaignDiscount({
      lines: [{ eventId: "ev1", categoryId: "cat-a", quantity: 2, unitGrossCents: 4900 }],
      campaignsByEventId: new Map([["ev1", campaigns]]),
      channel: "online",
      now,
    });
    expect(applied?.label).toBe("Sommer-Rabatt");
    expect(applied?.discountCents).toBe(1000);
    expect(applied?.badgeDisclaimer).toBe("* beim Kauf von 2 Tickets");
  });

  it("only counts eligible categories toward order promo", () => {
    const campaigns = [
      campaign({
        id: "normal-only",
        name: "Sommer-Rabatt",
        type: "fixed",
        value: 1000,
        applyMode: "order",
        minQuantity: 2,
        categoryIds: ["cat-normal"],
      }),
    ];
    const map = new Map([["ev1", campaigns]]);
    expect(
      resolveOrderCampaignDiscount({
        lines: [
          { eventId: "ev1", categoryId: "cat-vip", quantity: 2, unitGrossCents: 9900 },
        ],
        campaignsByEventId: map,
        channel: "online",
        now,
      }),
    ).toBeNull();
    expect(
      resolveOrderCampaignDiscount({
        lines: [
          { eventId: "ev1", categoryId: "cat-normal", quantity: 1, unitGrossCents: 4900 },
          { eventId: "ev1", categoryId: "cat-vip", quantity: 1, unitGrossCents: 9900 },
        ],
        campaignsByEventId: map,
        channel: "online",
        now,
      }),
    ).toBeNull();
    expect(
      resolveOrderCampaignDiscount({
        lines: [
          { eventId: "ev1", categoryId: "cat-normal", quantity: 2, unitGrossCents: 4900 },
          { eventId: "ev1", categoryId: "cat-vip", quantity: 1, unitGrossCents: 9900 },
        ],
        campaignsByEventId: map,
        channel: "online",
        now,
      })?.discountCents,
    ).toBe(1000);
  });

  it("formats category scope hint when Aktion is not for all categories", () => {
    const cats = [
      { id: "cat-normal", name: "Normal" },
      { id: "cat-vip", name: "VIP" },
    ];
    expect(formatCampaignCategoryScopeHint(["cat-normal"], cats)).toBe("gilt für Normal");
    expect(formatCampaignCategoryScopeHint(["cat-normal", "cat-vip"], cats)).toBeNull();
    expect(formatCampaignCategoryScopeHint([], cats)).toBeNull();
    expect(
      mergeCampaignDisclaimerParts("* beim Kauf von 2 Tickets", "gilt für Normal"),
    ).toBe("* beim Kauf von 2 Tickets · gilt für Normal");
  });
});
