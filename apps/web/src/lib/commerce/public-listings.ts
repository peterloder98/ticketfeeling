import { resolveEventCoverUrl } from "@/lib/commerce/event-cover";
import {
  categoryInventoryCapacity,
  sharedRemainingQuantity,
} from "@/lib/commerce/inventory-availability";
import { effectiveEventStatus } from "@/lib/commerce/event-sale";
import { formatDeDateTime } from "@/lib/datetime-de";

export type ListingEvent = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  status: string;
  /** Used so listing badges flip to on-sale when Vorverkaufsstart is reached. */
  presaleStartsAt?: Date | null;
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
    id: string;
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
  /** Flattened categories with eventId for campaign pricing */
  ticketCategories: {
    id: string;
    eventId: string;
    priceGrossCents: number;
    capacity: number;
    pools: { soldQuantity: number; heldQuantity: number; capacity: number }[];
  }[];
  /** Event ids represented on this card (tour collapses many). */
  eventIds: string[];
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
  return formatDeDateTime(d, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortByStart(a: ListingEvent, b: ListingEvent) {
  const at = a.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return at - bt;
}

/** Prefer on-sale effective status for tour/group cards. */
function listingDisplayStatus(dates: ListingEvent[], now = new Date()): string {
  const statuses = dates.map((d) =>
    effectiveEventStatus({ status: d.status, presaleStartsAt: d.presaleStartsAt }, now),
  );
  if (statuses.some((s) => s === "presale_active" || s === "published")) {
    return statuses.find((s) => s === "presale_active" || s === "published")!;
  }
  if (statuses.some((s) => s === "sold_out")) return "sold_out";
  return statuses[0] ?? "announcement";
}

export type ListingLinkMode = "public" | "embed";

function eventHref(slug: string, mode: ListingLinkMode) {
  return mode === "embed" ? `/embed/event/${slug}` : `/event/${slug}`;
}

function tourHref(slug: string, mode: ListingLinkMode) {
  return mode === "embed" ? `/embed/tour/${slug}` : `/tour/${slug}`;
}

function cardFromDates(
  dates: ListingEvent[],
  opts: { key: string; href: string; name: string; coverHint?: string | null },
): PublicListingCard {
  const ordered = [...dates].sort(sortByStart);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const cover =
    opts.coverHint?.trim() ||
    resolveEventCoverUrl(first) ||
    ordered.map((d) => resolveEventCoverUrl(d)).find(Boolean) ||
    null;

  const whenLabel =
    ordered.length === 1
      ? formatWhen(first.eventStartsAt)
      : first.eventStartsAt && last.eventStartsAt
        ? `${ordered.length} Termine · ${formatShortDate(first.eventStartsAt)} – ${formatShortDate(last.eventStartsAt)}`
        : `${ordered.length} Termine`;

  const cities = [
    ...new Set(
      ordered
        .map((d) => d.location?.city || d.location?.name)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  return {
    key: opts.key,
    href: opts.href,
    name: opts.name,
    status: listingDisplayStatus(ordered),
    coverImageUrl: cover,
    whenLabel,
    locationName:
      cities.length === 1
        ? ordered.find((d) => (d.location?.city || d.location?.name) === cities[0])?.location
            ?.name ?? cities[0]!
        : null,
    locationCity: cities.length === 1 ? cities[0]! : cities.length > 1 ? "Mehrere Orte" : null,
    ctaLabel: ordered.length > 1 ? "Termine wählen" : "Event ansehen",
    eventStartsAt: first.eventStartsAt,
    showRemainingAvailability: ordered.some((d) => d.showRemainingAvailability),
    ticketCategories: ordered.flatMap((d) =>
      d.ticketCategories.map((c) => ({
        id: c.id,
        eventId: d.id,
        priceGrossCents: c.priceGrossCents,
        capacity: c.capacity,
        pools: c.pools,
      })),
    ),
    eventIds: ordered.map((d) => d.id),
    artists: first.artists.map((a) => ({
      name: a.artist.name,
      imageUrl: a.artist.profileImageUrl,
    })),
    dateCount: ordered.length,
  };
}

function cardFromSingle(event: ListingEvent): PublicListingCard {
  return {
    key: `event-${event.id}`,
    href: `/event/${event.slug}`,
    name: event.name,
    status: listingDisplayStatus([event]),
    coverImageUrl: resolveEventCoverUrl(event),
    whenLabel: formatWhen(event.eventStartsAt),
    locationName: event.location?.name ?? null,
    locationCity: event.location?.city ?? null,
    ctaLabel: "Event ansehen",
    eventStartsAt: event.eventStartsAt,
    showRemainingAvailability: event.showRemainingAvailability,
    ticketCategories: event.ticketCategories.map((c) => ({
      id: c.id,
      eventId: event.id,
      priceGrossCents: c.priceGrossCents,
      capacity: c.capacity,
      pools: c.pools,
    })),
    eventIds: [event.id],
    artists: event.artists.map((a) => ({
      name: a.artist.name,
      imageUrl: a.artist.profileImageUrl,
    })),
    dateCount: 1,
  };
}

/**
 * Collapse tour dates into one card (hero + listings).
 * 1) Group by tourId (skip draft tours)
 * 2) Fallback: same display name with 2+ dates (legacy / unlinked)
 */
export function buildPublicListingCards(
  events: ListingEvent[],
  opts?: { linkMode?: ListingLinkMode },
): PublicListingCard[] {
  const linkMode = opts?.linkMode ?? "public";
  const cards: PublicListingCard[] = [];
  const consumed = new Set<string>();

  // 1) Official tour grouping (skip draft tours — those dates fall through as singles)
  for (const event of events) {
    if (!event.tourId || consumed.has(event.id)) continue;
    if (event.tour?.visibility === "draft") {
      continue;
    }

    const dates = events
      .filter((e) => e.tourId === event.tourId && e.tour?.visibility !== "draft")
      .sort(sortByStart);
    for (const d of dates) consumed.add(d.id);

    const tour = event.tour;
    cards.push(
      cardFromDates(dates, {
        key: `tour-${event.tourId}`,
        href: tour?.slug
          ? tourHref(tour.slug, linkMode)
          : eventHref(dates[0]!.slug, linkMode),
        name: tour?.name || event.name,
        coverHint: tour?.coverImageUrl,
      }),
    );
  }

  // 2) Fallback: identical names (e.g. 3 Weihnachtstraum dates without tour link)
  const leftovers = events.filter((e) => !consumed.has(e.id));
  const byName = new Map<string, ListingEvent[]>();
  for (const event of leftovers) {
    const key = event.name.trim().toLocaleLowerCase("de-DE");
    const list = byName.get(key) ?? [];
    list.push(event);
    byName.set(key, list);
  }

  for (const group of byName.values()) {
    if (group.length >= 2) {
      for (const d of group) consumed.add(d.id);
      const ordered = [...group].sort(sortByStart);
      cards.push(
        cardFromDates(ordered, {
          key: `name-${ordered[0]!.id}`,
          href: eventHref(ordered[0]!.slug, linkMode),
          name: ordered[0]!.name,
        }),
      );
    }
  }

  // 3) Remaining singles, keep chronological insertion by scanning original order
  for (const event of events) {
    if (consumed.has(event.id)) continue;
    consumed.add(event.id);
    cards.push({
      ...cardFromSingle(event),
      href: eventHref(event.slug, linkMode),
    });
  }

  return cards.sort((a, b) => {
    const at = a.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return at - bt;
  });
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
    const cap = categoryInventoryCapacity(cat.capacity);
    capacity += cap;
    remaining += sharedRemainingQuantity(cat.pools, cat.capacity);
  }
  return { capacity, remaining };
}
