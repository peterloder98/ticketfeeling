/** Build a minimal iCalendar (.ics) for a ticket event. */

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

export function buildTicketIcs(input: TicketCalendarInput): { filename: string; body: string } {
  const endsAt =
    input.endsAt && input.endsAt.getTime() > input.startsAt.getTime()
      ? input.endsAt
      : new Date(input.startsAt.getTime() + 3 * 60 * 60 * 1000);
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
