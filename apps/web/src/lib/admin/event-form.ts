export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "event"
  );
}

/** App wall-clock timezone for admin datetime-local fields. */
export const APP_TIMEZONE = "Europe/Berlin";

function berlinParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second ?? "0"),
  };
}

/**
 * Format an absolute instant as `YYYY-MM-DDTHH:mm` in Europe/Berlin
 * for datetime-local / SmartDateTimeInput round-trips.
 */
export function toDatetimeLocalValue(date: Date | null | undefined) {
  if (!date) return "";
  const p = berlinParts(date);
  const hour = String(p.hour).padStart(2, "0");
  const minute = String(p.minute).padStart(2, "0");
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${p.year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parse wall-clock Y-M-D H:M[:S] as Europe/Berlin → UTC Date (DST-safe).
 */
function berlinWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date | null {
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
    return null;
  }

  // Iterate: treat desired wall as UTC, then correct by Berlin display delta (handles DST).
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const shown = berlinParts(new Date(utcMs));
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const wantAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = wantAsUtc - shownAsUtc;
    if (delta === 0) break;
    utcMs += delta;
  }
  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result;
}

/**
 * Parse a datetime-local string as Europe/Berlin wall time → UTC Date.
 *
 * Critical: `new Date("2026-08-06T09:06")` on a UTC server is 09:06 UTC (= 11:06 Berlin in summer).
 * That caused Vorverkaufsstart to jump +2h after save. Always interpret the wall clock in Berlin.
 *
 * Also:
 * - Date-only `YYYY-MM-DD` → Berlin midnight (not UTC midnight, which shows as 02:00 in summer).
 * - Absolute ISO with `Z` / offset → keep as instant (do not re-read digits as Berlin wall).
 */
export function parseDatetimeLocalBerlin(raw: string): Date | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  // Absolute ISO with timezone — never reinterpret clock digits as Berlin wall time.
  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(
      trimmed,
    )
  ) {
    const absolute = new Date(trimmed);
    return Number.isNaN(absolute.getTime()) ? null : absolute;
  }

  // Date-only: Berlin calendar day at 00:00 (avoids UTC-midnight → 02:00 Berlin display bug).
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return berlinWallToUtc(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
      0,
      0,
      0,
    );
  }

  // German display / pasted values: "29.11.2026, 16:03" or "29.11.2026 16:03 Uhr"
  const de = trimmed.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*Uhr)?$/i,
  );
  if (de) {
    return berlinWallToUtc(
      Number(de[3]),
      Number(de[2]),
      Number(de[1]),
      Number(de[4] ?? "0"),
      Number(de[5] ?? "0"),
      Number(de[6] ?? "0"),
    );
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return berlinWallToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? "0"),
  );
}

export const EVENT_STATUSES = [
  "draft",
  "announcement",
  "presale_active",
  "published",
  "paused",
  "sold_out",
  "cancelled",
  "completed",
] as const;

export const CREATE_EVENT_STATUSES = [
  "draft",
  "announcement",
  "presale_active",
  "published",
] as const;
