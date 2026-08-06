import { describe, expect, it } from "vitest";
import {
  applyDiscountOff,
  pickBestCampaign,
  resolveTicketUnitPrice,
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
});
