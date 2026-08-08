import { describe, expect, it } from "vitest";
import {
  formatProminentPlaceLabel,
  isVipCategory,
  parseSeatHighlight,
  resolvePlaceLabel,
  TICKET_ACCENT_H_PX,
  TICKET_BODY_ASPECT,
  TICKET_BRAND_LOGO_GAP_PX,
  TICKET_BRAND_LOGO_H_PX,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  TICKET_CORNER_RADIUS_PX,
} from "@/lib/commerce/ticket-presentation";
import {
  resolveEventCoverUrl,
  resolveTicketCoverUrl,
} from "@/lib/commerce/event-cover";

describe("isVipCategory", () => {
  it("detects vip kind and name", () => {
    expect(isVipCategory("VIP", "vip")).toBe(true);
    expect(isVipCategory("VIP Lounge", "standard")).toBe(true);
    expect(isVipCategory("Normal", "standard")).toBe(false);
  });
});

describe("resolvePlaceLabel", () => {
  it("prefers seat label", () => {
    expect(
      resolvePlaceLabel({
        seatLabel: "Reihe 2 · Platz 7",
        categoryKind: "standing",
      }),
    ).toBe("Reihe 2 · Platz 7");
  });

  it("falls back by category kind", () => {
    expect(resolvePlaceLabel({ categoryKind: "standing" })).toBe("Stehplatz");
    expect(resolvePlaceLabel({ categoryKind: "free_choice" })).toBe("Freie Platzwahl");
    expect(resolvePlaceLabel({ freeSeating: true })).toBe("Freie Platzwahl");
  });
});

describe("formatProminentPlaceLabel", () => {
  it("uppercases assigned seats", () => {
    expect(formatProminentPlaceLabel("Block A · Reihe 1 · Platz 9")).toEqual({
      label: "BLOCK A · REIHE 1 · PLATZ 9",
      hasAssignedSeat: true,
    });
  });

  it("formats free seating and standing", () => {
    expect(formatProminentPlaceLabel("Freie Platzwahl")).toEqual({
      label: "FREIE PLATZWAHL",
      hasAssignedSeat: false,
    });
    expect(formatProminentPlaceLabel("Stehplatz")).toEqual({
      label: "Stehplatz",
      hasAssignedSeat: false,
    });
  });
});

describe("parseSeatHighlight", () => {
  it("builds BLOCK/REIHE/PLATZ boxes", () => {
    expect(
      parseSeatHighlight("BLOCK A · REIHE 1 · PLATZ 9", true),
    ).toEqual({
      mode: "boxes",
      text: "BLOCK A · REIHE 1 · PLATZ 9",
      parts: [
        { label: "BLOCK", value: "A" },
        { label: "REIHE", value: "1" },
        { label: "PLATZ", value: "9" },
      ],
    });
  });

  it("keeps free seating as text", () => {
    expect(parseSeatHighlight("FREIE PLATZWAHL", false)).toEqual({
      mode: "text",
      parts: [],
      text: "FREIE PLATZWAHL",
    });
  });
});

describe("TICKET_BODY_ASPECT", () => {
  it("locks landscape ~2:1 (slightly shorter via denser middle)", () => {
    expect(TICKET_BODY_ASPECT).toBeGreaterThanOrEqual(2);
    expect(TICKET_BODY_ASPECT).toBeLessThanOrEqual(2.3);
  });

  it("gives middle column room (~29% cover)", () => {
    expect(TICKET_COL_COVER).toBeGreaterThanOrEqual(0.28);
    expect(TICKET_COL_COVER).toBeLessThanOrEqual(0.3);
    expect(TICKET_COL_COVER + TICKET_COL_QR).toBeLessThan(1);
  });

  it("shares face geometry for HTML and PDF", () => {
    expect(TICKET_CORNER_RADIUS_PX).toBe(14);
    expect(TICKET_BRAND_LOGO_H_PX).toBe(36);
    expect(TICKET_ACCENT_H_PX).toBe(3);
    expect(TICKET_BRAND_LOGO_GAP_PX).toBe(20);
  });
});

describe("resolveTicketCoverUrl", () => {
  it("prefers ticket hero over event cover", () => {
    expect(
      resolveTicketCoverUrl({
        ticketHeroImageUrl: "/covers/ticket-hero.jpg",
        coverImageUrl: "/covers/event.jpg",
        tour: { coverImageUrl: "/covers/tour.jpg" },
      }),
    ).toBe("/covers/ticket-hero.jpg");
  });

  it("falls back to event/tour cover", () => {
    expect(
      resolveTicketCoverUrl({
        ticketHeroImageUrl: null,
        coverImageUrl: null,
        tour: { coverImageUrl: "/covers/tour.jpg" },
      }),
    ).toBe("/covers/tour.jpg");
    expect(
      resolveEventCoverUrl({
        coverImageUrl: "/covers/event.jpg",
        tour: { coverImageUrl: "/covers/tour.jpg" },
      }),
    ).toBe("/covers/event.jpg");
  });
});
