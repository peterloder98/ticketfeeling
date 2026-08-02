import Link from "next/link";
import { prisma } from "@/lib/db";
import { BrandLogo } from "@/components/brand-logo";
import { EventCard } from "@/components/event-card";
import { TrustBar } from "@/components/trust-bar";
import { WhyTicketfeeling } from "@/components/why-ticketfeeling";
import { PersonalSupportSection } from "@/components/personal-support-section";
import { HeroEventCarousel } from "@/components/hero-event-carousel";
import { formatEuroFromCents } from "@/lib/money";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { getDefaultOrganization } from "@/lib/commerce/org";
import {
  buildPublicListingCards,
  remainingForCategories,
} from "@/lib/commerce/public-listings";

export const dynamic = "force-dynamic";

const PUBLIC_STATUSES = ["announcement", "published", "presale_active"] as const;

export default async function HomePage() {
  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  const events = await prisma.event.findMany({
    where: {
      status: { in: [...PUBLIC_STATUSES] },
    },
    include: {
      location: true,
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
        include: { pools: true },
        orderBy: { priceGrossCents: "asc" },
      },
      artists: {
        where: { announced: true, cancelled: false },
        include: { artist: true },
        orderBy: { sortOrder: "asc" },
        take: 4,
      },
    },
    orderBy: { eventStartsAt: "asc" },
  });

  const listings = buildPublicListingCards(events).slice(0, 6);

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
        <div className="tf-container grid items-center gap-6 py-8 md:grid-cols-[1.1fr_0.9fr] md:gap-10 md:py-10 lg:min-h-[520px]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--tf-teal)]">
              Ticketfeeling
            </p>
            <BrandLogo href={null} variant="full" priority className="!w-[120px] md:!w-[136px]" />
            <h1 className="max-w-xl text-3xl font-bold leading-[1.1] tracking-tight text-[var(--tf-navy)] md:text-5xl lg:text-[3.25rem]">
              Vorfreude beginnt beim Buchen.
            </h1>
            <p className="max-w-[36rem] text-base leading-relaxed text-[var(--tf-text-secondary)] md:text-lg">
              Live-Erlebnisse einfach, sicher und direkt beim Veranstalter buchen.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link href="/events" className="tf-btn tf-btn-primary !min-h-12 !px-6 text-base">
                Events entdecken
              </Link>
              <a href="#warum-ticketfeeling" className="tf-link text-base">
                Warum Ticketfeeling?
              </a>
            </div>
          </div>

          <HeroEventCarousel slides={heroSlides} />
        </div>
      </section>

      <TrustBar />

      <section className="pb-10 pt-10 md:pb-12 md:pt-12">
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
            {listings.map((card) => {
              const { remaining, capacity } = remainingForCategories(card.ticketCategories);
              const cheapest = card.ticketCategories.reduce(
                (min, c) => Math.min(min, c.priceGrossCents),
                Number.POSITIVE_INFINITY,
              );
              const priced = Number.isFinite(cheapest)
                ? formatCustomerPriceLabel({
                    ticketGrossCents: cheapest,
                    feeConfig,
                    formatEuro: formatEuroFromCents,
                    prefix: "ab",
                  })
                : null;
              return (
                <EventCard
                  key={card.key}
                  event={{
                    id: card.key,
                    slug: card.key,
                    name: card.name,
                    status: card.status,
                    whenLabel: card.whenLabel,
                    locationName: card.locationName,
                    locationCity: card.locationCity,
                    coverImageUrl: card.coverImageUrl,
                    priceLabel: priced?.totalLabel ?? null,
                    priceNote: priced?.surchargeLabel || null,
                    remainingTickets: remaining,
                    capacity,
                    showRemainingAvailability: card.showRemainingAvailability,
                    artists: card.artists,
                    href: card.href,
                    ctaLabel: card.ctaLabel,
                  }}
                />
              );
            })}
          </div>
          {listings.length === 0 ? (
            <p className="mt-8 text-base text-[var(--tf-text-secondary)]">
              Bald erscheinen hier die nächsten Events.
            </p>
          ) : null}
        </div>
      </section>

      <WhyTicketfeeling />
      <PersonalSupportSection />
    </div>
  );
}
