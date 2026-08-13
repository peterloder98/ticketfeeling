import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { TrustBar } from "@/components/trust-bar";
import { HeroEventCarousel } from "@/components/hero-event-carousel";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildPublicListingCards } from "@/lib/commerce/public-listings";
import { listingCardsToEventCardData } from "@/lib/commerce/listing-card-data";
import { loadPublicListingEvents } from "@/lib/commerce/listing-query";
import { listingGridClassName } from "@/lib/commerce/listing-grid";

/** Live flip of due Vorverkaufsstart must not wait on ISR cache. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [org, events] = await Promise.all([
    getDefaultOrganization(),
    loadPublicListingEvents({ take: 48 }),
  ]);
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  // Tours collapse to one card — hero + grid never list each tour date separately.
  const listings = buildPublicListingCards(events);
  const gridListings = listings.slice(0, 6);
  const gridCards = await listingCardsToEventCardData(gridListings, feeConfig);
  // Hero atmosphere needs real covers — skip listings without artwork.
  const withCovers = listings.filter((card) => Boolean(card.coverImageUrl));
  const heroSource = (withCovers.length > 0 ? withCovers : listings).slice(0, 3);
  const heroSlides = heroSource.map((card) => ({
    id: card.key,
    slug: card.href.startsWith("/tour/")
      ? card.href.replace("/tour/", "")
      : card.href.replace("/event/", ""),
    href: card.href,
    name: card.name,
    whenLabel: card.whenLabel,
    locationLabel:
      card.locationCity === "Mehrere Orte"
        ? "Mehrere Orte"
        : [card.locationName, card.locationCity].filter(Boolean).join(", ") || null,
    coverImageUrl: card.coverImageUrl,
  }));

  return (
    <div>
      <HeroEventCarousel slides={heroSlides} />

      <section id="aktuell" className="scroll-mt-24 pb-10 pt-9 md:pb-14 md:pt-12">
        <div className="tf-container">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="tf-display text-2xl md:text-4xl">Aktuelle Events</h2>
              <p className="mt-2 text-base text-[var(--tf-text-secondary)]">
                Wähle dein Event und sichere dir deinen Platz.
              </p>
            </div>
            <Link href="/events" className="tf-btn tf-btn-secondary !min-h-11 text-sm">
              Alle Events
            </Link>
          </div>

          <div className={listingGridClassName(gridCards.length)}>
            {gridCards.map((card) => (
              <EventCard key={card.id} event={card} quiet />
            ))}
          </div>
          {gridCards.length === 0 ? (
            <p className="mt-8 text-base text-[var(--tf-text-secondary)]">
              Bald erscheinen hier die nächsten Events.
            </p>
          ) : null}
        </div>
      </section>

      <TrustBar />
    </div>
  );
}
