import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-image";
import { EventPageUrgencyCountdown } from "@/components/live-urgency-countdown";
import { formatDeDateTime } from "@/lib/datetime-de";
import { FeeSurchargeNote } from "@/components/fee-info-dialog";

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
  /** Sale / regular from-price, e.g. "ab 49,00 €" */
  priceLabel?: string | null;
  /** Strikethrough list from-price when campaign active */
  listPriceLabel?: string | null;
  /** e.g. "−20%" — same Aktion language as ticket UI */
  saleBadge?: string | null;
  campaignName?: string | null;
  /** ISO end of the ab-price Aktion (listing countdown priority) */
  campaignValidUntil?: string | null;
  /** Small note under price, e.g. "zzgl. 4 % Verwaltungsgebühr" */
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
      ? formatDeDateTime(new Date(event.eventStartsAt), {
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
  const onSale = Boolean(event.listPriceLabel && event.saleBadge);

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[19px] border border-[var(--tf-line)] bg-white shadow-[0_3px_12px_rgba(15,39,71,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(15,39,71,0.1)]"
    >
      <div className="relative mx-auto aspect-square w-full max-h-[444px] max-w-[444px] overflow-hidden bg-[var(--tf-navy)]">
        <ResponsiveImage
          src={event.coverImageUrl}
          alt=""
          className="h-full w-full transition duration-300 group-hover:scale-[1.02]"
          fallback="event"
        />
        <span
          className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 md:p-4">
        <h3 className="line-clamp-3 min-h-[3.6rem] text-base font-bold leading-snug text-[var(--tf-navy)] md:text-lg">
          {event.name}
        </h3>

        <EventPageUrgencyCountdown
          className="py-0.5"
          variant="compact"
          size="sm"
          eventStartsAt={event.eventStartsAt}
          campaignValidUntils={
            event.campaignValidUntil ? [event.campaignValidUntil] : []
          }
          campaignName={event.campaignName}
        />

        {/* Always: 1) Datum/Uhrzeit  2) Location/Ort */}
        <div className="flex flex-col gap-1 text-[13px] leading-snug text-[var(--tf-text-secondary)]">
          <div className="flex w-full items-start gap-1.5">
            <Calendar
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]"
              strokeWidth={2}
              aria-hidden
            />
            <span className="block min-w-0 break-words">{when}</span>
          </div>
          {place ? (
            <div className="flex w-full items-start gap-1.5">
              <MapPin
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="block min-w-0 break-words line-clamp-2">{place}</span>
            </div>
          ) : null}
        </div>

        {artists.length > 0 ? (
          <p className="line-clamp-1 text-[13px] text-[var(--tf-text-secondary)]">
            {artists.map((a) => a.name).join(" · ")}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-[var(--tf-line)] pt-2.5">
          <div className="min-w-0">
            {onSale ? (
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-xs font-normal tabular-nums text-[var(--tf-text-secondary)] line-through">
                  {event.listPriceLabel}
                </span>
                {event.saleBadge ? (
                  <span className="tf-badge tf-badge-sale !px-1.5 !py-0.5 text-[10px] font-semibold leading-none">
                    {event.saleBadge}
                  </span>
                ) : null}
                <span className="text-sm font-bold tabular-nums text-[var(--tf-sale)]">
                  {event.priceLabel}
                </span>
              </div>
            ) : (
              <span className="block text-sm font-semibold text-[var(--tf-navy)]">
                {event.priceLabel ?? "Tickets"}
              </span>
            )}
            {onSale && event.campaignName ? (
              <span className="mt-0.5 block text-[11px] font-medium text-[var(--tf-navy)]">
                {event.campaignName}
              </span>
            ) : null}
            {event.priceNote ? (
              <FeeSurchargeNote
                as="p"
                note={event.priceNote}
                className="mt-0.5"
                textClassName="text-[11px] text-[var(--tf-text-secondary)]"
              />
            ) : null}
          </div>
          <span className="tf-btn tf-btn-primary !min-h-9 !px-3 text-xs">{cta}</span>
        </div>
      </div>
    </Link>
  );
}
