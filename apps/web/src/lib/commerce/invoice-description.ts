/** Shared invoice line-item description helpers (no PDF deps). */

/** Full event datetime for invoice line detail (German, Berlin). */
export function formatInvoiceEventWhen(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatInvoiceLocationLabel(input: {
  locationSnapshot?: string | null;
  location?: {
    name: string;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
  } | null;
}): string | null {
  const snap = input.locationSnapshot?.trim();
  if (snap) return snap;
  const loc = input.location;
  if (!loc) return null;
  const street = [loc.street, loc.houseNumber].filter(Boolean).join(" ");
  const city = [loc.postalCode, loc.city].filter(Boolean).join(" ");
  const parts = [loc.name, street, city].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Stored invoice-item description including date/Ort when available. */
export function buildInvoiceTicketDescription(item: {
  eventNameSnapshot: string;
  categorySnapshot: string;
  eventStartsAtSnapshot?: Date | null;
  locationSnapshot?: string | null;
}): string {
  const title = `${item.eventNameSnapshot} – ${item.categorySnapshot}`;
  const parts = [title];
  const when = formatInvoiceEventWhen(item.eventStartsAtSnapshot);
  if (when) parts.push(`Datum: ${when}`);
  const place = item.locationSnapshot?.trim();
  if (place) parts.push(`Ort: ${place}`);
  return parts.join("\n");
}
