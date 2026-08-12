import { prisma } from "@/lib/db";

/**
 * Canonical streets for Weihnachtstraum 2026 venues.
 * Prod may have street = venue name (shows as "Name · Name, PLZ City") or wrong PLZ.
 * Idempotent — safe on every WT event page load / migrate-deploy.
 */
export const WEIHNACHTSTRAUM_2026_VENUES = [
  {
    slug: "buergerhaus-loewenberg",
    name: "Bürgerhaus Löwenberg",
    street: "Am Waldstadion",
    houseNumber: "6",
    postalCode: "16775",
    city: "Löwenberger Land",
    country: "DE",
    description: "Bürgerhaus Löwenberg, Am Waldstadion 6, 16775 Löwenberger Land, Deutschland.",
  },
  {
    slug: "buergersaal-ergolding",
    name: "Bürgersaal Ergolding",
    street: "Lindenstraße",
    houseNumber: "40",
    postalCode: "84030",
    city: "Ergolding",
    country: "DE",
    description: "Bürgersaal Ergolding, Lindenstraße 40, 84030 Ergolding, Deutschland.",
  },
  {
    slug: "kent-club-hamburg",
    name: "Kent Club",
    street: "Stresemannstraße",
    houseNumber: "163",
    postalCode: "22769",
    city: "Hamburg",
    country: "DE",
    description: "Kent Club, Stresemannstraße 163, 22769 Hamburg, Deutschland.",
  },
] as const;

export async function ensureWeihnachtstraum2026Venues(): Promise<number> {
  let updated = 0;
  try {
    for (const venue of WEIHNACHTSTRAUM_2026_VENUES) {
      const result = await prisma.location.updateMany({
        where: { slug: venue.slug },
        data: {
          name: venue.name,
          street: venue.street,
          houseNumber: venue.houseNumber,
          postalCode: venue.postalCode,
          city: venue.city,
          country: venue.country,
          description: venue.description,
        },
      });
      updated += result.count;
    }
  } catch (err) {
    console.error("[ensureWeihnachtstraum2026Venues]", err);
  }
  return updated;
}
