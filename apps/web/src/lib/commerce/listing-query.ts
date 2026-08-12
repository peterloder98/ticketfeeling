import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { scheduleReleaseDuePresales } from "@/lib/commerce/ensure-presale-release";
import type { ListingEvent } from "@/lib/commerce/public-listings";

/** Slim include for public listing cards (homepage / events / embed). */
export const publicListingArtistInclude = {
  where: { announced: true, cancelled: false },
  select: {
    artist: { select: { name: true, profileImageUrl: true } },
  },
  orderBy: { sortOrder: "asc" as const },
  take: 4,
} as const;

export const publicListingInclude = {
  location: { select: { name: true, city: true } },
  tour: {
    select: {
      id: true,
      name: true,
      slug: true,
      coverImageUrl: true,
      description: true,
      visibility: true,
      artists: publicListingArtistInclude,
    },
  },
  ticketCategories: {
    where: { status: "active", onlineBookable: true },
    select: {
      id: true,
      priceGrossCents: true,
      capacity: true,
      pools: {
        select: { soldQuantity: true, heldQuantity: true, capacity: true },
      },
    },
    orderBy: { priceGrossCents: "asc" as const },
  },
  artists: publicListingArtistInclude,
} satisfies Prisma.EventInclude;

export const PUBLIC_LISTING_STATUSES = [
  "announcement",
  "published",
  "presale_active",
  "sold_out",
] as const;

const publicListingSelect = {
  id: true,
  slug: true,
  name: true,
  subtitle: true,
  status: true,
  presaleStartsAt: true,
  eventStartsAt: true,
  showRemainingAvailability: true,
  coverImageUrl: true,
  tourId: true,
  artistsUseTourDefaults: true,
  ...publicListingInclude,
} satisfies Prisma.EventSelect;

/**
 * Load public listing rows. Presale DB flips run in the background (throttled);
 * effectiveEventStatus keeps badges/CTAs correct without blocking first paint.
 */
export async function loadPublicListingEvents(opts?: {
  take?: number;
}): Promise<ListingEvent[]> {
  scheduleReleaseDuePresales({ take: 200 });

  return (await prisma.event.findMany({
    where: {
      status: { in: [...PUBLIC_LISTING_STATUSES] },
    },
    select: publicListingSelect,
    orderBy: { eventStartsAt: "asc" },
    take: opts?.take ?? 48,
  })) as ListingEvent[];
}
