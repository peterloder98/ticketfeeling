import { describe, expect, it } from "vitest";
import { formatDeDateTime, formatDeTime, withUhr } from "@/lib/datetime-de";

describe("withUhr", () => {
  it("appends Uhr to clock times", () => {
    expect(withUhr("18:00")).toBe("18:00 Uhr");
    expect(withUhr("Fr., 6. Aug. 2026, 18:00")).toBe("Fr., 6. Aug. 2026, 18:00 Uhr");
  });

  it("is idempotent and skips date-only labels", () => {
    expect(withUhr("18:00 Uhr")).toBe("18:00 Uhr");
    expect(withUhr("6. Aug. 2026")).toBe("6. Aug. 2026");
    expect(withUhr("Termin folgt")).toBe("Termin folgt");
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
});
