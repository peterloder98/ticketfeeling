import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { EventCard } from "@/components/event-card";
import { TrustBar } from "@/components/trust-bar";
import { PersonalSupportSection } from "@/components/personal-support-section";
import { HeroEventCarousel } from "@/components/hero-event-carousel";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildPublicListingCards } from "@/lib/commerce/public-listings";
import { listingCardsToEventCardData } from "@/lib/commerce/listing-card-data";
import { loadPublicListingEvents } from "@/lib/commerce/listing-query";

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
  const nextListing = listings[0] ?? null;
  const heroSlides = listings.slice(0, 3).map((card) => ({
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
      <section className="border-b border-[var(--tf-line)] bg-white">
        <div className="tf-container grid items-center gap-6 py-7 md:grid-cols-[1.05fr_0.95fr] md:gap-10 md:py-9 lg:min-h-[480px]">
          <div className="space-y-4">
            <BrandLogo href={null} variant="full" priority className="!h-20 sm:!h-[5.25rem] md:!h-[5.5rem]" />
            <h1 className="max-w-xl text-3xl font-bold leading-[1.1] tracking-tight text-[var(--tf-navy)] md:text-5xl lg:text-[3.25rem]">
              Vorfreude beginnt beim Buchen.
            </h1>
            <p className="max-w-[34rem] text-base leading-relaxed text-[var(--tf-text-secondary)] md:text-lg">
              Tickets sicher und direkt beim Veranstalter — klar, persönlich, ohne Umwege.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a href="#aktuell" className="tf-btn tf-btn-primary !min-h-12 !px-6 text-base">
                Tickets finden
              </a>
              {nextListing ? (
                <Link href={nextListing.href} className="tf-link text-base">
                  Zum nächsten Event
                </Link>
              ) : null}
            </div>
          </div>

          <HeroEventCarousel slides={heroSlides} />
        </div>
      </section>

      <section id="aktuell" className="scroll-mt-24 pb-10 pt-8 md:pb-12 md:pt-10">
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

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
      <PersonalSupportSection />
    </div>
  );
}
