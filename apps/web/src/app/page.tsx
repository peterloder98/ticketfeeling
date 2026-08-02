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

export const dynamic = "force-dynamic";

function remainingForEvent(
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

export default async function HomePage() {
  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["announcement", "published", "presale_active"] },
    },
    include: {
      location: true,
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
    take: 6,
  });

  const heroSlides = events.slice(0, 3).map((event) => ({
    id: event.id,
    slug: event.slug,
    name: event.name,
    whenLabel: event.eventStartsAt
      ? event.eventStartsAt.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    locationLabel: event.location
      ? `${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
      : null,
    coverImageUrl: event.coverImageUrl,
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

          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const { remaining, capacity } = remainingForEvent(event.ticketCategories);
              const cheapest = event.ticketCategories[0];
              const priced = cheapest
                ? formatCustomerPriceLabel({
                    ticketGrossCents: cheapest.priceGrossCents,
                    feeConfig,
                    formatEuro: formatEuroFromCents,
                    prefix: "ab",
                  })
                : null;
              return (
                <EventCard
                  key={event.id}
                  event={{
                    id: event.id,
                    slug: event.slug,
                    name: event.name,
                    subtitle: event.subtitle,
                    status: event.status,
                    eventStartsAt: event.eventStartsAt,
                    locationName: event.location?.name,
                    locationCity: event.location?.city,
                    coverImageUrl: event.coverImageUrl,
                    priceLabel: priced?.totalLabel ?? null,
                    priceNote: priced?.surchargeLabel || null,
                    remainingTickets: remaining,
                    capacity,
                    showRemainingAvailability: event.showRemainingAvailability,
                    artists: event.artists.map((a) => ({
                      name: a.artist.name,
                      imageUrl: a.artist.profileImageUrl,
                    })),
                  }}
                />
              );
            })}
          </div>
          {events.length === 0 ? (
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
