import { prisma } from "@/lib/db";
import { EventCard } from "@/components/event-card";
import { formatEuroFromCents } from "@/lib/money";
import { Search } from "lucide-react";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { getDefaultOrganization } from "@/lib/commerce/org";
import {
  buildPublicListingCards,
  remainingForCategories,
} from "@/lib/commerce/public-listings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function EventsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["announcement", "published", "presale_active", "planned"] },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { subtitle: { contains: q, mode: "insensitive" } },
              { location: { name: { contains: q, mode: "insensitive" } } },
              { location: { city: { contains: q, mode: "insensitive" } } },
              { tour: { name: { contains: q, mode: "insensitive" } } },
              {
                artists: {
                  some: { artist: { name: { contains: q, mode: "insensitive" } } },
                },
              },
            ],
          }
        : {}),
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

  const listings = buildPublicListingCards(events);

  return (
    <div className="tf-container py-8 md:py-10">
      <h1 className="tf-display text-3xl md:text-5xl">Events entdecken</h1>
      <p className="mt-2 max-w-xl text-base text-[var(--tf-text-secondary)]">
        Finde Konzerte und Erlebnisse — nach Künstler, Ort oder Stimmung.
      </p>

      <form className="relative mt-6 max-w-xl">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[var(--tf-teal)]"
          strokeWidth={2}
          aria-hidden
        />
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Künstler, Events oder Orte suchen"
          className="tf-input tf-input-search !min-h-11 text-base"
          aria-label="Events suchen"
        />
      </form>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
        <p className="mt-10 text-base text-[var(--tf-text-secondary)]">
          Keine Treffer{q ? ` für „${q}“` : ""}. Versuche einen anderen Suchbegriff.
        </p>
      ) : null}
    </div>
  );
}
