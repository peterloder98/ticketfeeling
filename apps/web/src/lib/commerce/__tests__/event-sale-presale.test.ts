import { describe, expect, it } from "vitest";
import {
  effectiveEventStatus,
  isEventSaleOpen,
  resolvePersistedEventStatus,
  statusAfterPresaleStart,
} from "@/lib/commerce/event-sale";

describe("presale status transitions", () => {
  const now = new Date("2026-08-06T08:30:00.000Z"); // 10:30 Berlin
  const past = new Date("2026-08-06T08:17:00.000Z"); // 10:17 Berlin
  const future = new Date("2026-08-06T10:00:00.000Z"); // 12:00 Berlin

  it("flips announcement to Im Verkauf when Vorverkaufsstart is reached", () => {
    expect(statusAfterPresaleStart("announcement", past, now)).toBe("presale_active");
    expect(effectiveEventStatus({ status: "announcement", presaleStartsAt: past }, now)).toBe(
      "presale_active",
    );
  });

  it("flips draft to Im Verkauf when Vorverkaufsstart is reached (effective + persist)", () => {
    expect(statusAfterPresaleStart("draft", past, now)).toBe("presale_active");
    expect(effectiveEventStatus({ status: "draft", presaleStartsAt: past }, now)).toBe(
      "presale_active",
    );
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "draft",
        presaleStartsAt: past,
        coverImageUrl: "/covers/x.jpg",
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

  it("auto-flips to Im Verkauf without cover", () => {
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "announcement",
        presaleStartsAt: past,
        coverImageUrl: null,
        now,
      }),
    ).toBe("presale_active");
  });

  it("allows explicit Im Verkauf without cover", () => {
    expect(
      resolvePersistedEventStatus({
        requestedStatus: "presale_active",
        presaleStartsAt: past,
        coverImageUrl: null,
        now,
      }),
    ).toBe("presale_active");
  });

  it("does not treat paused as on sale", () => {
    expect(effectiveEventStatus({ status: "paused", presaleStartsAt: past }, now)).toBe("paused");
    expect(statusAfterPresaleStart("paused", past, now)).toBe("paused");
  });
});

describe("isEventSaleOpen without cover", () => {
  const now = new Date("2026-08-06T08:30:00.000Z");
  const past = new Date("2026-08-06T08:17:00.000Z");

  it("opens sale when released even if cover is missing", () => {
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
    ).toBe(true);
  });

  it("opens sale for effective Im Verkauf (announcement + reached start) without cover", () => {
    expect(
      isEventSaleOpen(
        {
          status: "announcement",
          presaleStartsAt: past,
          coverImageUrl: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("closes sale when paused or cancelled", () => {
    expect(
      isEventSaleOpen({ status: "paused", presaleStartsAt: past }, now),
    ).toBe(false);
    expect(
      isEventSaleOpen({ status: "cancelled", presaleStartsAt: past }, now),
    ).toBe(false);
  });

  it("closes sale when saleClosedEarly is set", () => {
    expect(
      isEventSaleOpen(
        {
          status: "presale_active",
          presaleStartsAt: past,
          saleClosedEarly: true,
        },
        now,
      ),
    ).toBe(false);
  });
});
