import { describe, expect, it } from "vitest";
import {
  canStartSales,
  effectiveEventStatus,
  hasValidEventCover,
  isEventSaleOpen,
  isSalesActivationBlocked,
  resolvePersistedEventStatus,
  statusAfterPresaleStart,
} from "@/lib/commerce/event-sale";

describe("presale status transitions", () => {
  const now = new Date("2026-08-06T08:30:00.000Z"); // 10:30 Berlin
  const past = new Date("2026-08-06T08:17:00.000Z"); // 10:17 Berlin
  const future = new Date("2026-08-06T10:00:00.000Z"); // 12:00 Berlin

  it("flips announcement to Im Verkauf when Vorverkaufsstart is reached and cover ok", () => {
    expect(statusAfterPresaleStart("announcement", past, now, true)).toBe("presale_active");
    expect(
      effectiveEventStatus(
        {
          status: "announcement",
          presaleStartsAt: past,
          coverImageUrl: "/covers/x.jpg",
          eventStartsAt: past,
        },
        now,
      ),
    ).toBe("presale_active");
  });

  it("flips draft to Im Verkauf when Vorverkaufsstart is reached (effective + persist)", () => {
    expect(statusAfterPresaleStart("draft", past, now, true)).toBe("presale_active");
    expect(
      effectiveEventStatus(
        {
          status: "draft",
          presaleStartsAt: past,
          coverImageUrl: "/covers/x.jpg",
          eventStartsAt: past,
        },
        now,
      ),
    ).toBe("presale_active");
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "draft",
        presaleStartsAt: past,
        coverImageUrl: "/covers/x.jpg",
        eventStartsAt: past,
        now,
      }),
    ).toBe("presale_active");
  });

  it("promotes draft with future Vorverkaufsstart to Verkauf geplant", () => {
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "draft",
        presaleStartsAt: future,
        coverImageUrl: null,
        now,
      }),
    ).toBe("announcement");
  });

  it("keeps pure draft without Vorverkaufsstart as draft", () => {
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "draft",
        presaleStartsAt: null,
        coverImageUrl: null,
        now,
      }),
    ).toBe("draft");
  });

  it("does not auto-flip to Im Verkauf without cover", () => {
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "announcement",
        presaleStartsAt: past,
        coverImageUrl: null,
        now,
      }),
    ).toBe("announcement");
    expect(
      effectiveEventStatus(
        { status: "announcement", presaleStartsAt: past, coverImageUrl: null },
        now,
      ),
    ).toBe("announcement");
  });

  it("blocks explicit Im Verkauf without cover (persists as announcement if start set)", () => {
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "presale_active",
        presaleStartsAt: past,
        coverImageUrl: null,
        now,
      }),
    ).toBe("announcement");
  });

  it("does not treat paused as on sale", () => {
    expect(effectiveEventStatus({ status: "paused", presaleStartsAt: past }, now)).toBe("paused");
    expect(statusAfterPresaleStart("paused", past, now)).toBe("paused");
  });
});

describe("canStartSales / cover gate", () => {
  const now = new Date("2026-08-06T08:30:00.000Z");
  const past = new Date("2026-08-06T08:17:00.000Z");

  it("requires cover", () => {
    expect(hasValidEventCover({ coverImageUrl: null })).toBe(false);
    expect(hasValidEventCover({ coverImageUrl: "/covers/x.jpg" })).toBe(true);
    expect(
      canStartSales({
        coverImageUrl: null,
        eventStartsAt: past,
        categories: [{ priceGrossCents: 1000, capacity: 10 }],
      }).reasons,
    ).toContain("MISSING_EVENT_COVER");
  });

  it("accepts tour cover", () => {
    expect(
      canStartSales({
        coverImageUrl: null,
        tour: { coverImageUrl: "/covers/tour.jpg" },
        eventStartsAt: past,
        categories: [{ priceGrossCents: 1000, capacity: 10 }],
      }).ok,
    ).toBe(true);
  });

  it("blocks sale open without cover", () => {
    expect(
      isEventSaleOpen(
        {
          status: "presale_active",
          presaleStartsAt: past,
          coverImageUrl: null,
          tour: { coverImageUrl: null },
        },
        now,
      ),
    ).toBe(false);
  });

  it("opens sale when released with cover", () => {
    expect(
      isEventSaleOpen(
        {
          status: "presale_active",
          presaleStartsAt: past,
          coverImageUrl: "/covers/x.jpg",
        },
        now,
      ),
    ).toBe(true);
  });

  it("reports activation blocked when start due and cover missing", () => {
    const blocked = isSalesActivationBlocked(
      {
        status: "announcement",
        presaleStartsAt: past,
        coverImageUrl: null,
        eventStartsAt: past,
        categories: [{ priceGrossCents: 1000, capacity: 10 }],
      },
      now,
    );
    expect(blocked?.reasons).toContain("MISSING_EVENT_COVER");
  });

  it("closes sale when paused or cancelled", () => {
    expect(isEventSaleOpen({ status: "paused", presaleStartsAt: past }, now)).toBe(false);
    expect(isEventSaleOpen({ status: "cancelled", presaleStartsAt: past }, now)).toBe(false);
  });

  it("closes sale when saleClosedEarly is set", () => {
    expect(
      isEventSaleOpen(
        {
          status: "presale_active",
          presaleStartsAt: past,
          coverImageUrl: "/covers/x.jpg",
          saleClosedEarly: true,
        },
        now,
      ),
    ).toBe(false);
  });
});
