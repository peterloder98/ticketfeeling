import { describe, expect, it } from "vitest";
import { formatCampaignPromoCallout } from "@/lib/commerce/campaign-price-ui";

describe("formatCampaignPromoCallout", () => {
  it("consolidates Sommer-Rabatt order promo into name + benefit", () => {
    expect(
      formatCampaignPromoCallout({
        campaignName: "Sommer-Rabatt",
        saleBadge: "10 € Rabatt ab 2 Tickets",
        saleDisclaimer: "* beim Kauf von 2 Tickets",
      }),
    ).toEqual({
      title: "Sommer-Rabatt",
      detail: "10 € Rabatt ab 2 Tickets",
    });
  });

  it("drops redundant disclaimer when badge already has ticket threshold", () => {
    expect(
      formatCampaignPromoCallout({
        saleBadge: "10 € Rabatt ab 2 Tickets",
        saleDisclaimer: "* beim Kauf von 2 Tickets",
      }),
    ).toEqual({ title: "10 € Rabatt ab 2 Tickets" });
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
