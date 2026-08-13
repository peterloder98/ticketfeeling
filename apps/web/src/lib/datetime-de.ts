/** Europe/Berlin wall clock for customer-facing German date/time copy. */
export const BERLIN_TZ = "Europe/Berlin";

/**
 * Remove seconds from German/Intl clock fragments (…:00:00 → …:00).
 * Display-only — never use on ISO storage strings.
 */
export function stripSecondsFromLabel(label: string): string {
  return label.replace(/(\d{1,2}:\d{2}):\d{2}\b/g, "$1");
}

/**
 * Append " Uhr" when the label includes a clock time (e.g. 18:00) and does not
 * already contain "Uhr". Safe for date-only strings and idempotent re-application.
 * Do not use on ISO strings, datetime-local values, or API payloads.
 */
export function withUhr(label: string): string {
  const trimmed = stripSecondsFromLabel(label.trim());
  if (!trimmed) return label;
  if (/\bUhr\b/i.test(trimmed)) return trimmed;
  if (!/\d{1,2}:\d{2}\b/.test(trimmed)) return trimmed;
  return `${trimmed} Uhr`;
}

const BERLIN_DISPLAY_LOCK: Intl.DateTimeFormatOptions = {
  timeZone: BERLIN_TZ,
  // Force 24h — never let caller options or locale defaults flip to 12h / override TZ.
  hour12: false,
  hourCycle: "h23",
};

/** Safe defaults: German numeric date + HH:MM (no seconds). */
const DEFAULT_DATETIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Normalize Intl options so times never include seconds.
 * - Drops `second`
 * - Coerces timeStyle medium/long/full → short
 * - Bare/default locale datetime (no style/parts) → numeric DE date + HH:MM
 */
export function withoutSeconds(
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormatOptions {
  const { second: _drop, ...rest } = options;
  const opts: Intl.DateTimeFormatOptions = { ...rest };

  if (
    opts.timeStyle === "medium" ||
    opts.timeStyle === "long" ||
    opts.timeStyle === "full"
  ) {
    opts.timeStyle = "short";
  }

  const hasStyle = opts.dateStyle != null || opts.timeStyle != null;
  const hasTimeParts = opts.hour != null || opts.minute != null;
  const hasDateParts =
    opts.weekday != null ||
    opts.year != null ||
    opts.month != null ||
    opts.day != null ||
    opts.era != null;

  if (!hasStyle && !hasTimeParts && !hasDateParts) {
    return { ...DEFAULT_DATETIME };
  }

  if (!hasStyle && hasTimeParts) {
    opts.hour = opts.hour ?? "2-digit";
    opts.minute = opts.minute ?? "2-digit";
  }

  return opts;
}

/** Full German datetime for display (includes "Uhr" when a time is present). */
export function formatDeDateTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return withUhr(
    date.toLocaleString("de-DE", {
      ...withoutSeconds(options),
      ...BERLIN_DISPLAY_LOCK,
    }),
  );
}

/** Clock time only for display, e.g. "18:00 Uhr". */
export function formatDeTime(date: Date): string {
  return withUhr(
    date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      ...BERLIN_DISPLAY_LOCK,
    }),
  );
}
