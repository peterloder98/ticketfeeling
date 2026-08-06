import { formatDeDateTime } from "@/lib/datetime-de";

/** German date/time for cart & checkout line items (Europe/Berlin). */
export function formatCartEventWhen(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return formatDeDateTime(date, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type CartItemEventMetaProps = {
  eventStartsAt?: string | Date | null;
  locationName?: string | null;
  locationCity?: string | null;
  /** Wrapper class; defaults to stacked meta under the event name. */
  className?: string;
};

/** Termin · Location · Ort under an event name — matches checkout summary. */
export function CartItemEventMeta({
  eventStartsAt,
  locationName,
  locationCity,
  className,
}: CartItemEventMetaProps) {
  const when = formatCartEventWhen(eventStartsAt);
  const venue = locationName?.trim() || null;
  const city = locationCity?.trim() || null;
  if (!when && !venue && !city) return null;

  return (
    <div className={className}>
      {when ? (
        <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
          <span className="font-medium text-[var(--tf-navy)]">Termin · </span>
          {when}
        </p>
      ) : null}
      {venue ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">
          <span className="font-medium text-[var(--tf-navy)]">Location · </span>
          {venue}
        </p>
      ) : null}
      {city ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">
          <span className="font-medium text-[var(--tf-navy)]">Ort · </span>
          {city}
        </p>
      ) : null}
    </div>
  );
}
