import { formatDeDateTime } from "@/lib/datetime-de";

/** Fields needed to disambiguate same-named events (tour dates, cities). */
export type EventOptionLabelInput = {
  name: string;
  eventStartsAt?: Date | string | null;
  locationCity?: string | null;
  locationName?: string | null;
  whenLabel?: string | null;
  city?: string | null;
};

/**
 * Single-line label: „Name · 12. Dez. 2026, 19:00 Uhr · Berlin“.
 * Use in selects, invite lists, and any place duplicate names collide.
 */
export function formatEventOptionLabel(event: EventOptionLabelInput): string {
  const parts: string[] = [event.name.trim() || "Event"];

  const when =
    event.whenLabel?.trim() ||
    (event.eventStartsAt
      ? formatDeDateTime(new Date(event.eventStartsAt), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "");
  if (when) parts.push(when);

  const place = (event.locationCity ?? event.city)?.trim() || event.locationName?.trim();
  if (place) parts.push(place);

  return parts.join(" · ");
}
