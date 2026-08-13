import { describe, expect, it } from "vitest";
import {
  TICKET_PREVIEW_ORDER_NUMBER,
  TICKET_PREVIEW_QR_PAYLOAD,
  buildEventTicketPreviewPresentation,
  pickTicketPreviewCategories,
} from "@/lib/commerce/ticket-preview";
import { isVipCategory } from "@/lib/commerce/ticket-presentation-shared";

describe("buildEventTicketPreviewPresentation", () => {
  it("uses event cover/sponsors and non-redeemable QR payload", () => {
    const data = buildEventTicketPreviewPresentation({
      event: {
        name: "Open Air Preview",
        eventStartsAt: new Date("2026-08-15T18:00:00+02:00"),
        doorsOpenAt: new Date("2026-08-15T16:30:00+02:00"),
        coverImageUrl: "/covers/demo.jpg",
        ticketSponsorLogoAboveUrl: "/sponsors/a.png",
        ticketSponsorLogoBelowUrl: "/sponsors/b.png",
        organizerName: "Demo GmbH",
        location: {
          name: "Olympiahalle",
          postalCode: "80809",
          city: "München",
        },
      },
      category: {
        name: "Kategorie 1",
        categoryKind: "seated",
        freeSeating: false,
        priceGrossCents: 7900,
      },
    });

    expect(data.eventName).toBe("Open Air Preview");
    expect(data.coverUrl).toBe("/covers/demo.jpg");
    expect(data.sponsorLogoAboveUrl).toBe("/sponsors/a.png");
    expect(data.sponsorLogoBelowUrl).toBe("/sponsors/b.png");
    expect(data.orderNumber).toBe(TICKET_PREVIEW_ORDER_NUMBER);
    expect(data.qrToken).toBe(TICKET_PREVIEW_QR_PAYLOAD);
    expect(data.isVip).toBe(false);
    expect(data.priceLabel).toContain("79,00");
    expect(data.locationName).toBe("Olympiahalle");
  });

  it("falls back gracefully without categories or cover", () => {
    const data = buildEventTicketPreviewPresentation({
      event: { name: "Entwurf" },
      category: null,
    });
    expect(data.eventName).toBe("Entwurf");
    expect(data.categoryName).toBe("Beispielkategorie");
    expect(data.coverUrl).toBeNull();
    expect(data.dateLabel).toBe("Datum noch offen");
    expect(data.locationName).toBe("Ort noch offen");
    expect(data.qrToken).toBe(TICKET_PREVIEW_QR_PAYLOAD);
  });

  it("shows VIP extras and gold path for VIP categories", () => {
    const data = buildEventTicketPreviewPresentation({
      event: {
        name: "Gala",
        doorsOpenAt: new Date("2026-12-01T18:00:00+01:00"),
      },
      category: {
        name: "VIP Lounge",
        categoryKind: "vip",
        extrasShortText: "Separater Einlass + Getränk",
        doorsOpenAt: new Date("2026-12-01T17:00:00+01:00"),
        doorsNote: "VIP-Eingang Ost",
        priceGrossCents: 19900,
      },
    });
    expect(data.isVip).toBe(true);
    expect(data.extrasShortText).toContain("Separater Einlass");
    expect(data.doors.isCategoryOverride).toBe(true);
  });
});

describe("pickTicketPreviewCategories", () => {
  it("picks first standard and first VIP", () => {
    const cats = [
      { name: "Kat 1", categoryKind: "standard" },
      { name: "VIP", categoryKind: "vip" },
      { name: "Stehplatz", categoryKind: "standing" },
    ];
    const { standard, vip } = pickTicketPreviewCategories(cats);
    expect(standard?.name).toBe("Kat 1");
    expect(vip?.name).toBe("VIP");
    expect(isVipCategory(vip!.name, vip!.categoryKind)).toBe(true);
  });
});
