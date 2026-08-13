import { describe, expect, it } from "vitest";
import {
  formatDeDateTime,
  formatDeTime,
  stripSecondsFromLabel,
  withUhr,
  withoutSeconds,
} from "@/lib/datetime-de";

describe("stripSecondsFromLabel", () => {
  it("removes seconds from clock times", () => {
    expect(stripSecondsFromLabel("29.11.2026, 17:00:00")).toBe("29.11.2026, 17:00");
    expect(stripSecondsFromLabel("17:00:00")).toBe("17:00");
  });

  it("leaves HH:MM alone", () => {
    expect(stripSecondsFromLabel("19:00 Uhr")).toBe("19:00 Uhr");
  });
});

describe("withUhr", () => {
  it("appends Uhr to clock times", () => {
    expect(withUhr("18:00")).toBe("18:00 Uhr");
    expect(withUhr("Fr., 6. Aug. 2026, 18:00")).toBe("Fr., 6. Aug. 2026, 18:00 Uhr");
  });

  it("strips seconds then appends Uhr", () => {
    expect(withUhr("29.11.2026, 17:00:00")).toBe("29.11.2026, 17:00 Uhr");
  });

  it("is idempotent and skips date-only labels", () => {
    expect(withUhr("18:00 Uhr")).toBe("18:00 Uhr");
    expect(withUhr("6. Aug. 2026")).toBe("6. Aug. 2026");
    expect(withUhr("Termin folgt")).toBe("Termin folgt");
  });
});

describe("withoutSeconds", () => {
  it("coerces medium timeStyle to short", () => {
    expect(withoutSeconds({ dateStyle: "medium", timeStyle: "medium" })).toEqual({
      dateStyle: "medium",
      timeStyle: "short",
    });
  });

  it("defaults bare options to numeric date + HH:MM", () => {
    expect(withoutSeconds({})).toEqual({
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  });
});

describe("formatDeTime", () => {
  it("formats Berlin wall time with Uhr", () => {
    const d = new Date("2026-08-06T16:00:00.000Z"); // 18:00 in summer Berlin
    expect(formatDeTime(d)).toBe("18:00 Uhr");
  });

  it("does not show UTC midnight as 02:00 without Berlin lock (caller must use helpers)", () => {
    // UTC midnight in CEST is 02:00 Berlin — helpers must always use Europe/Berlin.
    const utcMidnight = new Date("2026-08-06T00:00:00.000Z");
    expect(formatDeTime(utcMidnight)).toBe("02:00 Uhr");
    expect(
      formatDeDateTime(utcMidnight, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ).toMatch(/6\.\s*Aug\.?\s*2026.*02:00 Uhr/);
  });

  it("formats winter Berlin evening correctly", () => {
    const d = new Date("2026-12-12T18:00:00.000Z"); // 19:00 CET
    expect(formatDeTime(d)).toBe("19:00 Uhr");
  });
});

describe("formatDeDateTime", () => {
  it("ignores caller timeZone override attempts via lock", () => {
    const d = new Date("2026-08-06T16:00:00.000Z");
    const label = formatDeDateTime(d, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: true,
    });
    expect(label).toBe("18:00 Uhr");
  });

  it("never shows seconds on default datetime", () => {
    const d = new Date("2026-11-29T16:00:00.000Z"); // 17:00 CET
    const label = formatDeDateTime(d);
    expect(label).toBe("29.11.2026, 17:00 Uhr");
    expect(label).not.toMatch(/:\d{2}:\d{2}/);
  });

  it("never shows seconds even if caller requests them", () => {
    const d = new Date("2026-11-29T16:00:00.000Z");
    const label = formatDeDateTime(d, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    expect(label).toBe("29.11.2026, 17:00 Uhr");
  });
});
