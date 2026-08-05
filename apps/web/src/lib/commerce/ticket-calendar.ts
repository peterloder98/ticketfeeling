/** Build iCalendar (.ics) and deep links for ticket events. */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** UTC timestamp as YYYYMMDDTHHMMSSZ */
export function formatIcsUtc(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function foldLine(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export type TicketCalendarInput = {
  ticketId: string;
  ticketNumber: string;
  eventName: string;
  startsAt: Date;
  /** Defaults to startsAt + 3h */
  endsAt?: Date | null;
  locationLabel?: string | null;
  description?: string | null;
  url?: string | null;
};

export function resolveCalendarEndsAt(startsAt: Date, endsAt?: Date | null) {
  if (endsAt && endsAt.getTime() > startsAt.getTime()) return endsAt;
  return new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
}

export function buildTicketIcs(input: TicketCalendarInput): { filename: string; body: string } {
  const endsAt = resolveCalendarEndsAt(input.startsAt, input.endsAt);
  const stamp = formatIcsUtc(new Date());
  const uid = `ticket-${input.ticketId}@ticketfeeling.de`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ticketfeeling//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsUtc(input.startsAt)}`,
    `DTEND:${formatIcsUtc(endsAt)}`,
    `SUMMARY:${escapeIcsText(input.eventName)}`,
    ...(input.locationLabel
      ? [`LOCATION:${escapeIcsText(input.locationLabel)}`]
      : []),
    `DESCRIPTION:${escapeIcsText(
      input.description?.trim() ||
        `Ticket ${input.ticketNumber} · Ticketfeeling`,
    )}`,
    ...(input.url ? [`URL:${input.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const body = `${lines.map(foldLine).join("\r\n")}\r\n`;
  const safeName = input.ticketNumber.replace(/[^\w.-]+/g, "_").slice(0, 48);
  return {
    filename: `ticketfeeling-${safeName || input.ticketId.slice(0, 8)}.ics`,
    body,
  };
}

export type CalendarDeepLinkInput = {
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  locationLabel?: string | null;
  description?: string | null;
  url?: string | null;
};

function calendarDescription(input: CalendarDeepLinkInput) {
  const parts = [input.description?.trim(), input.url?.trim()].filter(Boolean);
  return parts.join("\n") || undefined;
}

/** Google Calendar “Add event” template URL */
export function buildGoogleCalendarUrl(input: CalendarDeepLinkInput) {
  const endsAt = resolveCalendarEndsAt(input.startsAt, input.endsAt);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${formatIcsUtc(input.startsAt)}/${formatIcsUtc(endsAt)}`,
  });
  const details = calendarDescription(input);
  if (details) params.set("details", details);
  if (input.locationLabel) params.set("location", input.locationLabel);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook.com / Hotmail compose URL */
export function buildOutlookCalendarUrl(input: CalendarDeepLinkInput) {
  const endsAt = resolveCalendarEndsAt(input.startsAt, input.endsAt);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.title,
    startdt: input.startsAt.toISOString(),
    enddt: endsAt.toISOString(),
  });
  const body = calendarDescription(input);
  if (body) params.set("body", body);
  if (input.locationLabel) params.set("location", input.locationLabel);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Yahoo Calendar compose URL */
export function buildYahooCalendarUrl(input: CalendarDeepLinkInput) {
  const endsAt = resolveCalendarEndsAt(input.startsAt, input.endsAt);
  const params = new URLSearchParams({
    v: "60",
    title: input.title,
    st: formatIcsUtc(input.startsAt),
    et: formatIcsUtc(endsAt),
  });
  const desc = calendarDescription(input);
  if (desc) params.set("desc", desc);
  if (input.locationLabel) params.set("in_loc", input.locationLabel);
  return `https://calendar.yahoo.com/?${params.toString()}`;
}

/** webcal:// variant of an https .ics URL (Apple / native calendar apps) */
export function toWebcalUrl(httpsIcsUrl: string) {
  if (httpsIcsUrl.startsWith("https://")) return `webcal://${httpsIcsUrl.slice("https://".length)}`;
  if (httpsIcsUrl.startsWith("http://")) return `webcal://${httpsIcsUrl.slice("http://".length)}`;
  return httpsIcsUrl;
}
