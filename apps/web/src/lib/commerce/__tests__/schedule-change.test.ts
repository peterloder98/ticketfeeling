import { describe, expect, it } from "vitest";
import {
  clampCampaignToEventEnd,
  clampCampaignToEventStart,
  scheduleEndChanged,
  scheduleStartChanged,
  shiftRelativeToStart,
  shouldShowEventStartCountdown,
} from "@/lib/commerce/schedule-change";
import {
  formatCampaignCountdown,
  formatEventStartCountdown,
  getCountdownParts,
  resolveUrgencyCountdown,
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

  it("detects end changes at minute precision", () => {
    const a = new Date("2026-08-20T21:00:00.000Z");
    const b = new Date("2026-08-20T21:00:30.000Z");
    const c = new Date("2026-08-20T22:00:00.000Z");
    expect(scheduleEndChanged(a, b)).toBe(false);
    expect(scheduleEndChanged(a, c)).toBe(true);
  });

  it("clamps campaign validUntil to new event end", () => {
    const eventEndsAt = new Date("2026-08-13T21:00:00.000Z");
    const result = clampCampaignToEventEnd({
      validFrom: new Date("2026-07-01T00:00:00.000Z"),
      validUntil: new Date("2026-08-20T23:59:00.000Z"),
      eventEndsAt,
    });
    expect(result.changed).toBe(true);
    expect(result.validUntil.toISOString()).toBe(eventEndsAt.toISOString());
    expect(result.validFrom.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("leaves campaign unchanged when already before event end", () => {
    const eventEndsAt = new Date("2026-08-13T21:00:00.000Z");
    const result = clampCampaignToEventEnd({
      validFrom: new Date("2026-07-01T00:00:00.000Z"),
      validUntil: new Date("2026-08-13T20:00:00.000Z"),
      eventEndsAt,
    });
    expect(result.changed).toBe(false);
    expect(result.validUntil.toISOString()).toBe("2026-08-13T20:00:00.000Z");
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

  it("resolves live parts with seconds", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const until = new Date("2026-08-13T14:05:07.000Z");
    const parts = getCountdownParts(until, now);
    expect(parts).toMatchObject({
      days: 3,
      hours: 2,
      minutes: 5,
      seconds: 7,
    });
  });

  it("resolveUrgencyCountdown prefers campaign over event", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const eventStartsAt = new Date("2026-08-13T18:00:00.000Z");
    const campaignUntil = new Date("2026-08-12T17:59:00.000Z");
    const target = resolveUrgencyCountdown({
      eventStartsAt,
      campaignValidUntils: [campaignUntil],
      nowMs: now,
    });
    expect(target?.kind).toBe("campaign");
    expect(target?.title).toBe("Aktion endet in");
    expect(target?.endsAt).toBe(campaignUntil.toISOString());

    const named = resolveUrgencyCountdown({
      eventStartsAt,
      campaignValidUntils: [campaignUntil],
      campaignName: "Frühbucherrabatt",
      nowMs: now,
    });
    expect(named?.kind).toBe("campaign");
    expect(named?.title).toBe("Frühbucherrabatt endet in");

    const eventOnly = resolveUrgencyCountdown({
      eventStartsAt,
      campaignValidUntils: [null],
      nowMs: now,
    });
    expect(eventOnly?.kind).toBe("event");
    expect(eventOnly?.title).toBe("Event startet in");
  });
});
