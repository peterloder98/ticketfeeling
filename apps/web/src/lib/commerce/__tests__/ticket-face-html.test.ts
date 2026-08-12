import { describe, expect, it } from "vitest";
import { buildTicketFaceEmbed } from "@/lib/commerce/ticket-document";
import type { TicketPresentation } from "@/lib/commerce/ticket-presentation";
import {
  TICKET_COL_COVER,
  TICKET_COL_QR,
  TICKET_FACE_TYPE,
} from "@/lib/commerce/ticket-presentation-shared";

function mockData(overrides: Partial<TicketPresentation> = {}): TicketPresentation {
  return {
    ticketId: "t1",
    ticketNumber: "TF-T-TEST-1",
    eventName: "Test Event",
    dateLabel: "Samstag, 1. Januar 2027",
    startLabel: "20:00 Uhr",
    doors: {
      doorsOpenAt: null,
      doorsNote: null,
      isCategoryOverride: false,
      categoryName: "Kat 1",
      headlineLabel: "EINLASS",
      timeLabel: "18:30",
      headline: "EINLASS 18:30",
    },
    locationLines: ["Halle", "12345 Stadt"],
    locationShort: "Halle, Stadt",
    locationTicket: "Halle, 12345 Stadt",
    locationName: "Halle",
    locationDetail: "12345 Stadt",
    categoryName: "Kat 1",
    categoryKind: "seated",
    isVip: false,
    extrasShortText: null,
    placeLabel: "Block A · Reihe 1 · Platz 1",
    placeDisplayLabel: "BLOCK A · REIHE 1 · PLATZ 1",
    hasAssignedSeat: true,
    priceLabel: "50,00 €",
    coverUrl: "/covers/x.jpg",
    coverAbsoluteUrl: "https://example.com/covers/x.jpg",
    sponsorLogoAboveUrl: "/api/assets/00000000-0000-0000-0000-000000000001",
    sponsorLogoAboveAbsoluteUrl:
      "https://example.com/api/assets/00000000-0000-0000-0000-000000000001",
    sponsorLogoAboveScale: 1,
    sponsorLogoBelowUrl: null,
    sponsorLogoBelowAbsoluteUrl: null,
    sponsorLogoBelowScale: 1,
    sponsorAboveName: null,
    sponsorAboveHref: null,
    sponsorBelowName: null,
    sponsorBelowHref: null,
    organizerDisplayName: "Org",
    organizerAddress: "",
    organizerContact: null,
    holderName: "Max Muster",
    orderNumber: "TF-O-1",
    qrToken: "token",
    ...overrides,
  };
}

describe("buildTicketFaceEmbed", () => {
  it("uses shared column fractions and QR size without sponsors", () => {
    const face = buildTicketFaceEmbed(
      mockData({
        sponsorLogoAboveUrl: null,
        sponsorLogoAboveAbsoluteUrl: null,
      }),
      "data:image/png;base64,xx",
      { absoluteAssets: true },
    );
    expect(face.css).toContain(`${Math.round(TICKET_COL_COVER * 100)}%`);
    expect(face.css).toContain(`${Math.round(TICKET_COL_QR * 100)}%`);
    expect(face.css).toContain(`width: ${TICKET_FACE_TYPE.qrNoSponsor}px`);
    expect(face.html).not.toContain("tf-sponsor-logo");
    expect(face.html).toContain("tf-sponsor-slot");
    expect(face.html).not.toContain("flatten");
  });

  it("embeds absolute sponsor URLs without white-box styling", () => {
    const face = buildTicketFaceEmbed(mockData(), "data:image/png;base64,xx", {
      absoluteAssets: true,
    });
    expect(face.html).toContain(
      "https://example.com/api/assets/00000000-0000-0000-0000-000000000001",
    );
    expect(face.css).toContain("background: transparent");
    expect(face.html).not.toContain("Schlagerhitparade");
    expect(face.html).toContain("Test Event");
  });
});
