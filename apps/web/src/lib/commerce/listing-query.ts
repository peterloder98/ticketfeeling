import type { Prisma } from "@prisma/client";

/** Slim include for public listing cards (homepage / events / embed). */
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
    },
  },
  ticketCategories: {
    where: { status: "active", onlineBookable: true },
    select: {
      priceGrossCents: true,
      capacity: true,
      pools: {
        select: { soldQuantity: true, heldQuantity: true, capacity: true },
      },
    },
    orderBy: { priceGrossCents: "asc" as const },
  },
  artists: {
    where: { announced: true, cancelled: false },
    select: {
      artist: { select: { name: true, profileImageUrl: true } },
    },
    orderBy: { sortOrder: "asc" as const },
    take: 4,
  },
} satisfies Prisma.EventInclude;

export const PUBLIC_LISTING_STATUSES = [
  "announcement",
  "published",
  "presale_active",
  "sold_out",
] as const;
