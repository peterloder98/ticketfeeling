import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { ExpandableText } from "@/components/expandable-text";
import { ResponsiveImage } from "@/components/responsive-image";
import { formatEuroFromCents } from "@/lib/money";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const tour = await prisma.tour.findFirst({
    where: { slug, visibility: "published" },
    select: { name: true },
  });
  return { title: tour?.name ?? "Tour" };
}

export default async function PublicTourPage({ params }: Props) {
  const { slug } = await params;
  const tour = await prisma.tour.findFirst({
    where: { slug, visibility: "published" },
    include: {
      organization: { select: { settings: true } },
      events: {
        where: {
          // Per-date visibility: draft/cancelled stay private even if tour is published
          status: { in: ["announcement", "published", "presale_active", "sold_out"] },
        },
        include: {
          location: true,
          ticketCategories: {
            where: { status: "active", onlineBookable: true },
            orderBy: { priceGrossCents: "asc" },
            take: 1,
          },
        },
        orderBy: { eventStartsAt: "asc" },
      },
    },
  });

  if (!tour || tour.events.length === 0) notFound();

  const feeConfig = resolveActivePlatformFeeConfig(tour.organization.settings?.platformFeeConfig);
  const cover =
    tour.coverImageUrl?.trim() ||
    tour.events.map((e) => resolveEventCoverUrl({ ...e, tour })).find(Boolean) ||
    null;

  const cheapest = Math.min(
    ...tour.events.flatMap((e) => e.ticketCategories.map((c) => c.priceGrossCents)),
    Number.POSITIVE_INFINITY,
  );
  const priced =
    Number.isFinite(cheapest) && cheapest < Number.POSITIVE_INFINITY
      ? formatCustomerPriceLabel({
          ticketGrossCents: cheapest,
          feeConfig,
          formatEuro: formatEuroFromCents,
          prefix: "ab",
        })
      : null;

  return (
    <div className="tf-container py-8 md:py-10">
      <Link href="/events" className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]">
        ← Alle Events
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
        <div className="overflow-hidden rounded-[24px] border border-[var(--tf-line)] bg-[var(--tf-navy)]">
          <div className="aspect-square">
            <ResponsiveImage
              src={cover}
              alt={`Cover: ${tour.name}`}
              className="h-full w-full"
              fallback="event"
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
            Tour · {tour.events.length} Termine
          </p>
          <h1 className="mt-2 tf-display text-3xl md:text-5xl">{tour.name}</h1>
          {tour.description ? (
            <ExpandableText
              text={tour.description}
              lines={4}
              className="mt-3 max-w-[60ch] [&_p]:text-base"
            />
          ) : null}
          {priced ? (
            <p className="mt-4 text-lg font-semibold text-[var(--tf-navy)]">
              {priced.totalLabel}
              {priced.surchargeLabel ? (
                <span className="ml-2 text-sm font-normal text-[var(--tf-text-secondary)]">
                  {priced.surchargeLabel}
                </span>
              ) : null}
            </p>
          ) : null}

          <h2 className="mt-8 text-xl font-semibold text-[var(--tf-navy)]">Termin wählen</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Wähle Ort und Datum — danach geht’s zu den Tickets.
          </p>

          <ul className="mt-4 space-y-3">
            {tour.events.map((event) => {
              const when = event.eventStartsAt
                ? event.eventStartsAt.toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Termin folgt";
              const place = event.location
                ? `${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
                : null;
              const eventPrice = event.ticketCategories[0]
                ? formatCustomerPriceLabel({
                    ticketGrossCents: event.ticketCategories[0].priceGrossCents,
                    feeConfig,
                    formatEuro: formatEuroFromCents,
                    prefix: "ab",
                  })
                : null;

              return (
                <li key={event.id}>
                  <Link
                    href={`/event/${event.slug}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--tf-line)] bg-white px-4 py-4 transition hover:border-[var(--tf-teal)] hover:shadow-[0_8px_24px_rgba(15,39,71,0.08)]"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="flex items-start gap-2 text-base font-semibold text-[var(--tf-navy)]">
                        <Calendar
                          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-teal)]"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="min-w-0 break-words">{when} Uhr</span>
                      </p>
                      {place ? (
                        <p className="flex items-start gap-2 text-sm text-[var(--tf-text-secondary)]">
                          <MapPin
                            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-teal)]"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span className="min-w-0 break-words">{place}</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5 sm:flex-row sm:items-center">
                      {eventPrice ? (
                        <span className="text-sm font-semibold tabular-nums text-[var(--tf-navy)]">
                          {eventPrice.totalLabel}
                        </span>
                      ) : null}
                      <span className="tf-btn tf-btn-primary !min-h-10 !px-4 text-sm">
                        Tickets
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
