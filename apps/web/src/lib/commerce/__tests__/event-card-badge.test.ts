import { describe, expect, it } from "vitest";
import { resolveEventCardBadge } from "@/lib/commerce/event-card-badge";
import { isVipCategory } from "@/lib/commerce/ticket-presentation-shared";
import { remainingForCategories } from "@/lib/commerce/public-listings";

describe("resolveEventCardBadge", () => {
  it("returns null instead of a generic Tickets badge", () => {
    expect(
      resolveEventCardBadge({
        status: "presale_active",
        showRemainingAvailability: false,
      }),
    ).toBeNull();
  });

  it("shows Neu for announcements", () => {
    expect(resolveEventCardBadge({ status: "announcement" })).toEqual({
      label: "Neu",
      className: "bg-white text-[var(--tf-navy)]",
    });
  });

  it("shows Mehrere Termine for multi-date listings", () => {
    expect(
      resolveEventCardBadge({ status: "presale_active", dateCount: 3 }),
    ).toEqual({
      label: "Mehrere Termine",
      className: "bg-white text-[var(--tf-navy)]",
    });
  });

  it("prefers Aktion over Mehrere Termine when campaign is active", () => {
    expect(
      resolveEventCardBadge({
        status: "presale_active",
        dateCount: 3,
        hasCampaign: true,
        campaignLabel: "Sommer-Rabatt",
      }),
    ).toEqual({
      label: "Sommer-Rabatt",
      className: "bg-[var(--tf-sale)] text-white",
    });
  });

  it("falls back to Aktion for long / numeric campaign labels", () => {
    expect(
      resolveEventCardBadge({
        status: "presale_active",
        hasCampaign: true,
        campaignLabel: "−20%",
      })?.label,
    ).toBe("Aktion");
  });

  it("shows scarcity only when remaining availability is enabled", () => {
    expect(
      resolveEventCardBadge({
        status: "presale_active",
        remainingTickets: 10,
        capacity: 200,
        showRemainingAvailability: false,
      }),
    ).toBeNull();

    expect(
      resolveEventCardBadge({
        status: "presale_active",
        remainingTickets: 10,
        capacity: 200,
        showRemainingAvailability: true,
      })?.label,
    ).toBe("Fast ausverkauft");
  });

  it("shows VIP scarcity with gold styling", () => {
    expect(
      resolveEventCardBadge({
        status: "presale_active",
        showRemainingAvailability: true,
        vipNearlySoldOut: true,
      }),
    ).toEqual({
      label: "VIP fast ausverkauft",
      className: "bg-[var(--tf-gold)] text-[var(--tf-navy)]",
    });
  });
});

describe("isVipCategory helpers used for VIP badge upstream", () => {
  it("detects VIP by kind", () => {
    expect(isVipCategory("Lounge", "vip")).toBe(true);
    expect(isVipCategory("Kat 1", "standard")).toBe(false);
  });

  it("computes remaining for VIP pools", () => {
    const { remaining, capacity } = remainingForCategories([
      {
        capacity: 20,
        pools: [{ soldQuantity: 15, heldQuantity: 2, capacity: 20 }],
      },
    ]);
    expect(capacity).toBe(20);
    expect(remaining).toBe(3);
  });
});
