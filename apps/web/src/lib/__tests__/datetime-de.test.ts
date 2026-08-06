import { describe, expect, it } from "vitest";
import { formatDeTime, withUhr } from "@/lib/datetime-de";

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
    expect(formatDeTime(d)).toMatch(/^\d{2}:\d{2} Uhr$/);
  });
});
