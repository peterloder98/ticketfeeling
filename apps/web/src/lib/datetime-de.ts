/** Europe/Berlin wall clock for customer-facing German date/time copy. */
export const BERLIN_TZ = "Europe/Berlin";

/**
 * Append " Uhr" when the label includes a clock time (e.g. 18:00) and does not
 * already contain "Uhr". Safe for date-only strings and idempotent re-application.
 * Do not use on ISO strings, datetime-local values, or API payloads.
 */
export function withUhr(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return label;
  if (/\bUhr\b/i.test(trimmed)) return label;
  if (!/\d{1,2}:\d{2}\b/.test(trimmed)) return label;
  return `${trimmed} Uhr`;
}

/** Full German datetime for display (includes "Uhr" when a time is present). */
export function formatDeDateTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return withUhr(
    date.toLocaleString("de-DE", {
      timeZone: BERLIN_TZ,
      ...options,
    }),
  );
}

/** Clock time only for display, e.g. "18:00 Uhr". */
export function formatDeTime(date: Date): string {
  return withUhr(
    date.toLocaleTimeString("de-DE", {
      timeZone: BERLIN_TZ,
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
}
