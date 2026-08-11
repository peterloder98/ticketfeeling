import { describe, expect, it } from "vitest";
import {
  parseDatetimeLocalBerlin,
  toDatetimeLocalValue,
} from "@/lib/admin/event-form";

describe("parseDatetimeLocalBerlin", () => {
  it("parses datetime-local as Berlin wall (summer)", () => {
    const d = parseDatetimeLocalBerlin("2026-08-06T18:00");
    expect(d?.toISOString()).toBe("2026-08-06T16:00:00.000Z");
    expect(toDatetimeLocalValue(d)).toBe("2026-08-06T18:00");
  });

  it("parses datetime-local as Berlin wall (winter)", () => {
    const d = parseDatetimeLocalBerlin("2026-12-12T19:00");
    expect(d?.toISOString()).toBe("2026-12-12T18:00:00.000Z");
    expect(toDatetimeLocalValue(d)).toBe("2026-12-12T19:00");
  });

  it("treats date-only as Berlin midnight (not UTC midnight → 02:00)", () => {
    const d = parseDatetimeLocalBerlin("2026-08-06");
    expect(d?.toISOString()).toBe("2026-08-05T22:00:00.000Z");
    expect(toDatetimeLocalValue(d)).toBe("2026-08-06T00:00");
  });

  it("keeps absolute ISO with Z as an instant", () => {
    const d = parseDatetimeLocalBerlin("2026-08-06T16:00:00.000Z");
    expect(d?.toISOString()).toBe("2026-08-06T16:00:00.000Z");
    expect(toDatetimeLocalValue(d)).toBe("2026-08-06T18:00");
  });

  it("keeps absolute ISO with offset as an instant", () => {
    const d = parseDatetimeLocalBerlin("2026-12-12T19:00:00+01:00");
    expect(d?.toISOString()).toBe("2026-12-12T18:00:00.000Z");
  });
});
