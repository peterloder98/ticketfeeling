import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";

export type ListingEvent = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  status: string;
  eventStartsAt: Date | null;
  showRemainingAvailability: boolean;
  coverImageUrl: string | null;
  tourId: string | null;
  location: { name: string; city: string | null } | null;
  tour: {
    id: string;
    name: string;
    slug: string;
    coverImageUrl: string | null;
    description: string | null;
    visibility?: string;
  } | null;
  ticketCategories: {
    priceGrossCents: number;
    capacity: number;
    pools: { soldQuantity: number; heldQuantity: number; capacity: number }[];
  }[];
  artists: {
    artist: { name: string; profileImageUrl: string | null };
  }[];
};

export type PublicListingCard = {
  key: string;
  href: string;
  name: string;
  status: string;
  coverImageUrl: string | null;
  whenLabel: string;
  locationName: string | null;
  locationCity: string | null;
  ctaLabel: string;
  eventStartsAt: Date | null;
  showRemainingAvailability: boolean;
  ticketCategories: ListingEvent["ticketCategories"];
  artists: { name: string; imageUrl: string | null }[];
  dateCount: number;
};

function formatShortDate(d: Date) {
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatWhen(d: Date | null) {
  if (!d) return "Termin folgt";
  return d.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Collapse tour dates into one card; keep standalone events as-is. */
export function buildPublicListingCards(events: ListingEvent[]): PublicListingCard[] {
  const cards: PublicListingCard[] = [];
  const seenTourIds = new Set<string>();

  for (const event of events) {
    if (event.tourId && event.tour && event.tour.visibility !== "draft") {
      if (seenTourIds.has(event.tourId)) continue;
      seenTourIds.add(event.tourId);

      const dates = events
        .filter((e) => e.tourId === event.tourId)
        .sort((a, b) => {
          const at = a.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
          const bt = b.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
          return at - bt;
        });
      const first = dates[0]!;
      const last = dates[dates.length - 1]!;
      const cover =
        event.tour.coverImageUrl?.trim() ||
        resolveEventCoverUrl(first) ||
        dates.map((d) => resolveEventCoverUrl(d)).find(Boolean) ||
        null;

      const whenLabel =
        dates.length === 1
          ? formatWhen(first.eventStartsAt)
          : first.eventStartsAt && last.eventStartsAt
            ? `${dates.length} Termine · ${formatShortDate(first.eventStartsAt)} – ${formatShortDate(last.eventStartsAt)}`
            : `${dates.length} Termine`;

      const cities = [
        ...new Set(
          dates
            .map((d) => d.location?.city || d.location?.name)
            .filter((x): x is string => Boolean(x)),
        ),
      ];

      cards.push({
        key: `tour-${event.tour.id}`,
        href: `/tour/${event.tour.slug}`,
        name: event.tour.name,
        status: first.status,
        coverImageUrl: cover,
        whenLabel,
        locationName:
          cities.length === 1
            ? dates.find((d) => (d.location?.city || d.location?.name) === cities[0])?.location
                ?.name ?? cities[0]!
            : null,
        locationCity: cities.length === 1 ? cities[0]! : cities.length > 1 ? "Mehrere Orte" : null,
        ctaLabel: "Termine wählen",
        eventStartsAt: first.eventStartsAt,
        showRemainingAvailability: dates.some((d) => d.showRemainingAvailability),
        ticketCategories: dates.flatMap((d) => d.ticketCategories),
        artists: first.artists.map((a) => ({
          name: a.artist.name,
          imageUrl: a.artist.profileImageUrl,
        })),
        dateCount: dates.length,
      });
      continue;
    }

    cards.push({
      key: `event-${event.id}`,
      href: `/event/${event.slug}`,
      name: event.name,
      status: event.status,
      coverImageUrl: resolveEventCoverUrl(event),
      whenLabel: formatWhen(event.eventStartsAt),
      locationName: event.location?.name ?? null,
      locationCity: event.location?.city ?? null,
      ctaLabel: "Event ansehen",
      eventStartsAt: event.eventStartsAt,
      showRemainingAvailability: event.showRemainingAvailability,
      ticketCategories: event.ticketCategories,
      artists: event.artists.map((a) => ({
        name: a.artist.name,
        imageUrl: a.artist.profileImageUrl,
      })),
      dateCount: 1,
    });
  }

  return cards;
}

export function remainingForCategories(
  categories: {
    capacity: number;
    pools: { soldQuantity: number; heldQuantity: number; capacity: number }[];
  }[],
) {
  let capacity = 0;
  let remaining = 0;
  for (const cat of categories) {
    const sold = cat.pools.reduce((s, p) => s + p.soldQuantity, 0);
    const held = cat.pools.reduce((s, p) => s + p.heldQuantity, 0);
    const cap = Math.max(cat.capacity, ...cat.pools.map((p) => p.capacity), 0);
    capacity += cap;
    remaining += Math.max(0, cap - sold - held);
  }
  return { capacity, remaining };
}
