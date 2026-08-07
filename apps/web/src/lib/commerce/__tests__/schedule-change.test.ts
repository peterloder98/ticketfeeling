import { describe, expect, it } from "vitest";
import {
  clampCampaignToEventStart,
  scheduleStartChanged,
  shiftRelativeToStart,
  shouldShowEventStartCountdown,
} from "@/lib/commerce/schedule-change";
import {
  formatCampaignCountdown,
  formatEventStartCountdown,
} from "@/lib/commerce/campaign-price-ui";

describe("schedule-change", () => {
  it("detects start changes at minute precision", () => {
    const a = new Date("2026-08-20T18:00:00.000Z");
    const b = new Date("2026-08-20T18:00:30.000Z");
    const c = new Date("2026-08-13T18:00:00.000Z");
    expect(scheduleStartChanged(a, b)).toBe(false);
    expect(scheduleStartChanged(a, c)).toBe(true);
  });

  it("preserves end/doors offsets when start moves", () => {
    const oldStart = new Date("2026-08-20T18:00:00.000Z");
    const oldEnd = new Date("2026-08-20T21:00:00.000Z");
    const oldDoors = new Date("2026-08-20T17:00:00.000Z");
    const newStart = new Date("2026-08-13T18:00:00.000Z");
    expect(shiftRelativeToStart(oldEnd, oldStart, newStart)?.toISOString()).toBe(
      "2026-08-13T21:00:00.000Z",
    );
    expect(shiftRelativeToStart(oldDoors, oldStart, newStart)?.toISOString()).toBe(
      "2026-08-13T17:00:00.000Z",
    );
  });

  it("clamps campaign validUntil before new event start", () => {
    const newStart = new Date("2026-08-13T18:00:00.000Z");
    const result = clampCampaignToEventStart({
      validFrom: new Date("2026-07-01T00:00:00.000Z"),
      validUntil: new Date("2026-08-20T23:59:00.000Z"),
      newEventStartsAt: newStart,
    });
    expect(result.changed).toBe(true);
    expect(result.validUntil.getTime()).toBe(newStart.getTime() - 60_000);
    expect(result.validFrom.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("prefers campaign countdown over event countdown", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const eventStartsAt = new Date("2026-08-13T18:00:00.000Z");
    const campaignUntil = new Date("2026-08-13T17:59:00.000Z");
    expect(
      shouldShowEventStartCountdown({
        eventStartsAt,
        campaignValidUntils: [campaignUntil],
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      shouldShowEventStartCountdown({
        eventStartsAt,
        campaignValidUntils: [null],
        nowMs: now,
      }),
    ).toBe(true);
  });
});

describe("countdown copy", () => {
  it("shows campaign countdown within 7 days", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const until = new Date("2026-08-13T17:59:00.000Z");
    expect(formatCampaignCountdown(until, now)).toMatch(/Noch \d+ T/);
  });

  it("shows event countdown German copy", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const start = new Date("2026-08-13T18:00:00.000Z");
    expect(formatEventStartCountdown(start, now)).toMatch(/Nur noch/);
  });
});
