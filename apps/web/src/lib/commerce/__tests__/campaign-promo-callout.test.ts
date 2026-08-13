import { describe, expect, it } from "vitest";
import {
  formatCampaignPromoCallout,
  parsePromoBenefitLine,
} from "@/lib/commerce/campaign-price-ui";

describe("parsePromoBenefitLine", () => {
  it("splits savings and condition", () => {
    expect(parsePromoBenefitLine("10 € Rabatt ab 2 Tickets")).toEqual({
      savings: "10 € Rabatt",
      condition: "ab 2 Tickets",
    });
  });

  it("keeps percent savings scannable", () => {
    expect(parsePromoBenefitLine("−20%")).toEqual({ savings: "−20%" });
  });
});

describe("formatCampaignPromoCallout", () => {
  it("consolidates Sommer-Rabatt order promo into name + benefit", () => {
    expect(
      formatCampaignPromoCallout({
        campaignName: "Sommer-Rabatt",
        saleBadge: "10 € Rabatt ab 2 Tickets",
      }),
    ).toEqual({
      title: "Sommer-Rabatt",
      detail: "10 € Rabatt ab 2 Tickets",
      name: "Sommer-Rabatt",
      savings: "10 € Rabatt",
      condition: "ab 2 Tickets",
    });
  });

  it("drops redundant disclaimer when badge already has ticket threshold", () => {
    expect(
      formatCampaignPromoCallout({
        saleBadge: "10 € Rabatt ab 2 Tickets",
        saleDisclaimer: "* beim Kauf von 2 Tickets",
      }),
    ).toEqual({
      title: "10 € Rabatt",
      detail: "10 € Rabatt ab 2 Tickets",
      savings: "10 € Rabatt",
      condition: "ab 2 Tickets",
    });
  });

  it("keeps name + disclaimer when there is no badge", () => {
    expect(
      formatCampaignPromoCallout({
        campaignName: "Sommer-Rabatt",
        saleDisclaimer: "* beim Kauf von 2 Tickets",
      }),
    ).toEqual({
      title: "Sommer-Rabatt",
      detail: "beim Kauf von 2 Tickets",
      name: "Sommer-Rabatt",
    });
  });

  it("returns null when empty", () => {
    expect(formatCampaignPromoCallout({})).toBeNull();
    expect(
      formatCampaignPromoCallout({
        campaignName: "  ",
        saleBadge: null,
        saleDisclaimer: "",
      }),
    ).toBeNull();
  });

  it("avoids duplicating identical name and badge", () => {
    expect(
      formatCampaignPromoCallout({
        campaignName: "Sommer-Rabatt",
        saleBadge: "Sommer-Rabatt",
      }),
    ).toEqual({ title: "Sommer-Rabatt" });
  });
});
