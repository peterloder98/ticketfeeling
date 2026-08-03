import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import { ResponsiveImage } from "@/components/responsive-image";
import { OrgTracking } from "@/components/org-tracking";
import { EmbedBackLink } from "@/components/embed/embed-back-link";
import { ExpandableText } from "@/components/expandable-text";

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

export default async function EmbedTourPage({ params }: Props) {
  const { slug } = await params;
  const tour = await prisma.tour.findFirst({
    where: { slug, visibility: "published" },
    include: {
      organization: { select: { settings: true } },
      events: {
        where: {
          // Per-date: only publicly listed statuses (draft stays hidden)
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

  return (
    <>
      <OrgTracking embedMode />
      <div className="space-y-5">
        <EmbedBackLink label="Zurück" fallbackHref="/embed/shop" />

        <div className="flex gap-3">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-[var(--tf-navy)] sm:h-32 sm:w-32">
            <ResponsiveImage
              src={cover}
              alt=""
              className="h-full w-full object-cover"
              fallback="event"
            />
          </div>
          <div className="min-w-0 flex-1 py-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
              Tour · {tour.events.length} Termine
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--tf-navy)] sm:text-2xl">
              {tour.name}
            </h1>
            {tour.description ? (
              <ExpandableText text={tour.description} lines={3} className="mt-2" />
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-[var(--tf-navy)]">Termin wählen</h2>
          <p className="mt-0.5 text-sm text-[var(--tf-text-secondary)]">
            Wähle Ort und Datum — danach geht’s zu den Tickets.
          </p>
          <ul className="mt-3 space-y-2">
            {tour.events.map((event) => {
              const when = event.eventStartsAt
                ? event.eventStartsAt.toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Termin folgt";
              const place = [event.location?.name, event.location?.city]
                .filter(Boolean)
                .join(", ");
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
                    href={`/embed/event/${event.slug}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--tf-line)] bg-white px-3 py-3 transition hover:border-[var(--tf-teal)]"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex items-start gap-1.5 text-sm font-semibold text-[var(--tf-navy)]">
                        <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                        <span className="min-w-0 break-words">{when}</span>
                      </p>
                      {place ? (
                        <p className="flex items-start gap-1.5 text-xs text-[var(--tf-text-secondary)]">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                          <span className="min-w-0 break-words">{place}</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                      {eventPrice ? (
                        <span className="text-sm font-semibold tabular-nums text-[var(--tf-navy)]">
                          {eventPrice.totalLabel}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-[var(--tf-navy)] px-3 py-1.5 text-xs font-semibold text-white">
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
    </>
  );
}
