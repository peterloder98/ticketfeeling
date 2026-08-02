import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-image";

export type EventCardArtist = {
  name: string;
  imageUrl?: string | null;
};

export type EventCardData = {
  id: string;
  slug: string;
  name: string;
  subtitle?: string | null;
  status: string;
  eventStartsAt?: Date | string | null;
  /** Override datetime line (e.g. tour: "3 Termine · …") */
  whenLabel?: string | null;
  locationName?: string | null;
  locationCity?: string | null;
  coverImageUrl?: string | null;
  priceLabel?: string | null;
  /** Small note under price, e.g. "zzgl. 3 % Verwaltungsgebühr" */
  priceNote?: string | null;
  remainingTickets?: number | null;
  capacity?: number | null;
  /** When false, scarcity badges based on remaining counts are hidden */
  showRemainingAvailability?: boolean;
  artists?: EventCardArtist[];
  /** Defaults to /event/[slug] */
  href?: string;
  ctaLabel?: string;
};

function urgencyBadge(
  remaining: number | null | undefined,
  capacity: number | null | undefined,
  status: string,
  showRemaining: boolean,
) {
  if (status === "sold_out" || (remaining != null && remaining <= 0 && (capacity ?? 0) > 0)) {
    return { label: "Ausverkauft", className: "bg-white text-[var(--tf-navy)]" };
  }
  if (showRemaining && remaining != null && capacity != null && capacity > 0) {
    const ratio = remaining / capacity;
    if (remaining <= 25 || ratio <= 0.12) {
      return { label: "Fast ausverkauft", className: "bg-[#fff4e8] text-[#9a4d0a]" };
    }
    if (remaining <= 80 || ratio <= 0.35) {
      return {
        label: "Nur noch wenige Tickets",
        className: "bg-[rgba(20,184,166,0.95)] text-white",
      };
    }
  }
  if (status === "presale_active") {
    return { label: "Tickets", className: "bg-[rgba(20,184,166,0.95)] text-white" };
  }
  if (status === "announcement") {
    return { label: "Neu", className: "bg-white text-[var(--tf-navy)]" };
  }
  return { label: "Tickets", className: "bg-[rgba(20,184,166,0.95)] text-white" };
}

export function EventCard({ event }: { event: EventCardData }) {
  const when =
    event.whenLabel ??
    (event.eventStartsAt
      ? new Date(event.eventStartsAt).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Termin folgt");
  const place =
    event.locationCity === "Mehrere Orte"
      ? "Mehrere Orte"
      : [event.locationName, event.locationCity].filter(Boolean).join(", ");
  const badge = urgencyBadge(
    event.remainingTickets,
    event.capacity,
    event.status,
    Boolean(event.showRemainingAvailability),
  );
  const artists = event.artists?.slice(0, 4) ?? [];
  const href = event.href ?? `/event/${event.slug}`;
  const cta = event.ctaLabel ?? "Event ansehen";

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--tf-line)] bg-white shadow-[0_4px_16px_rgba(15,39,71,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(15,39,71,0.1)]"
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--tf-navy)]">
        <ResponsiveImage
          src={event.coverImageUrl}
          alt=""
          className="h-full w-full transition duration-300 group-hover:scale-[1.02]"
          fallback="event"
        />
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4 md:p-5">
        <h3 className="line-clamp-3 min-h-[4.5rem] text-lg font-bold leading-snug text-[var(--tf-navy)] md:text-xl">
          {event.name}
        </h3>

        <div className="space-y-1.5 text-sm text-[var(--tf-text-secondary)]">
          <p className="flex w-full items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            <span className="min-w-0">{when}</span>
          </p>
          {place ? (
            <p className="flex w-full items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
              <span className="min-w-0 line-clamp-2">{place}</span>
            </p>
          ) : null}
        </div>

        {artists.length > 0 ? (
          <p className="line-clamp-1 text-sm text-[var(--tf-text-secondary)]">
            {artists.map((a) => a.name).join(" · ")}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--tf-line)] pt-3">
          <div className="min-w-0">
            <span className="block text-base font-semibold text-[var(--tf-navy)]">
              {event.priceLabel ?? "Tickets"}
            </span>
            {event.priceNote ? (
              <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
                {event.priceNote}
              </span>
            ) : null}
          </div>
          <span className="tf-btn tf-btn-primary !min-h-11 !px-4 text-sm">{cta}</span>
        </div>
      </div>
    </Link>
  );
}
