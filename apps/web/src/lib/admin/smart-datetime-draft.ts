/** Pure draft helpers for SmartDate(Time) inputs — pad/commit only on blur. */

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isValidYmd(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}

export function formatDateDraft(y: number, m: number, d: number): string {
  return `${pad2(d)}.${pad2(m)}.${y}`;
}

export function formatTimeDraft(h: number, min: number): string {
  return `${pad2(h)}:${pad2(min)}`;
}

/** Keep digits and separators; never pad while typing. */
export function sanitizeDateDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d./]/g, "");
  // Prefer dots; allow typing without auto-padding.
  const digits = cleaned.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function sanitizeTimeDraft(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export type ParsedDateDraft = { day: number; month: number; year: number };
export type ParsedTimeDraft = { hour: number; minute: number };

/**
 * Parse a date draft on blur. Accepts partial single-digit day/month and pads.
 * Returns null if incomplete or invalid calendar date.
 */
export function parseDateDraft(draft: string): ParsedDateDraft | null {
  const digits = draft.replace(/\D/g, "");
  if (digits.length < 5) return null; // need at least d/m + 1 year digit → require 8 for commit
  if (digits.length !== 8) {
    // Allow 7 only if year was truncated? Prefer strict 8 digits (DDMMYYYY).
    return null;
  }
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (!isValidYmd(year, month, day)) return null;
  return { day, month, year };
}

/**
 * Looser blur parse: pad 1-digit day/month when separators present, e.g. "3.8.2026".
 */
export function parseDateDraftLoose(draft: string): ParsedDateDraft | null {
  const trimmed = draft.trim();
  if (!trimmed) return null;
  const strict = parseDateDraft(sanitizeDateDraft(trimmed));
  if (strict) return strict;

  const parts = trimmed.split(/[./]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (![day, month, year].every((n) => Number.isFinite(n))) return null;
  if (String(parts[2]).length !== 4) return null;
  if (!isValidYmd(year, month, day)) return null;
  return { day, month, year };
}

export function parseTimeDraft(draft: string): ParsedTimeDraft | null {
  const trimmed = draft.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;
  let hour: number;
  let minute: number;
  if (digits.length === 1 || digits.length === 2) {
    hour = Number(digits);
    minute = 0;
  } else if (digits.length === 3) {
    hour = Number(digits.slice(0, 1));
    minute = Number(digits.slice(1));
  } else {
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2, 4));
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Simulate focused typing with select-all on first keystroke (replacement mode).
 * `initialCommitted` is the padded display before focus; keystrokes replace it entirely
 * once the user starts typing after select-all.
 */
export function simulateDateTypingAfterSelectAll(
  _initialCommitted: string,
  keystrokes: string,
): string {
  let draft = "";
  for (const ch of keystrokes) {
    if (/\d/.test(ch)) {
      draft = sanitizeDateDraft(draft + ch);
    } else if (ch === "." || ch === "/") {
      // separators are inserted by sanitize from digit count; ignore manual
      continue;
    } else if (ch === "Backspace") {
      const digits = draft.replace(/\D/g, "").slice(0, -1);
      draft = sanitizeDateDraft(digits);
    }
  }
  return draft;
}

export function simulateTimeTypingAfterSelectAll(
  _initialCommitted: string,
  keystrokes: string,
): string {
  let draft = "";
  for (const ch of keystrokes) {
    if (/\d/.test(ch)) {
      draft = sanitizeTimeDraft(draft + ch);
    } else if (ch === "Backspace") {
      const digits = draft.replace(/\D/g, "").slice(0, -1);
      draft = sanitizeTimeDraft(digits);
    }
  }
  return draft;
}

/**
 * Simulate broken split-field merge (old bug): append digit into padded "0X" then slice(0,2).
 * Used only in tests to document the failure mode we must not regress into.
 */
export function simulateBrokenSplitMerge(padded: string, keystrokes: string): string {
  let value = padded.replace(/\D/g, "").slice(0, 2);
  for (const ch of keystrokes) {
    if (!/\d/.test(ch)) continue;
    value = (value + ch).replace(/\D/g, "").slice(0, 2);
  }
  return value;
}
