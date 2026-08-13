import { describe, expect, it } from "vitest";
import {
  parseDateDraftLoose,
  parseTimeDraft,
  sanitizeDateDraft,
  sanitizeTimeDraft,
  simulateBrokenSplitMerge,
  simulateDateTypingAfterSelectAll,
  simulateTimeTypingAfterSelectAll,
} from "@/lib/admin/smart-datetime-draft";

describe("smart-datetime-draft typing", () => {
  it("typing 31 after select-all yields 31 (not 03)", () => {
    expect(simulateDateTypingAfterSelectAll("03.08.2026", "31")).toBe("31");
    expect(simulateBrokenSplitMerge("03", "31")).toBe("03"); // documents old bug
  });

  it("typing 13 after select-all yields 13 (not 01)", () => {
    expect(simulateDateTypingAfterSelectAll("01.08.2026", "13")).toBe("13");
    expect(simulateBrokenSplitMerge("01", "13")).toBe("01");
  });

  it("typing full date builds TT.MM.JJJJ without padding mid-keystroke", () => {
    expect(simulateDateTypingAfterSelectAll("01.01.2026", "31122026")).toBe("31.12.2026");
    expect(sanitizeDateDraft("3112")).toBe("31.12");
    expect(sanitizeDateDraft("3")).toBe("3"); // no pad while typing
  });

  it("typing 23 after select-all yields 23 (not 02)", () => {
    expect(simulateTimeTypingAfterSelectAll("02:00", "23")).toBe("23");
    expect(simulateBrokenSplitMerge("02", "23")).toBe("02");
  });

  it("typing HHMM builds HH:MM without padding mid-keystroke", () => {
    expect(simulateTimeTypingAfterSelectAll("18:00", "2345")).toBe("23:45");
    expect(sanitizeTimeDraft("2")).toBe("2");
  });

  it("blur parse pads single-digit day/month", () => {
    expect(parseDateDraftLoose("3.8.2026")).toEqual({ day: 3, month: 8, year: 2026 });
    expect(parseDateDraftLoose("31.12.2026")).toEqual({ day: 31, month: 12, year: 2026 });
    expect(parseTimeDraft("9")).toEqual({ hour: 9, minute: 0 });
    expect(parseTimeDraft("23")).toEqual({ hour: 23, minute: 0 });
    expect(parseTimeDraft("23:05")).toEqual({ hour: 23, minute: 5 });
  });
});
