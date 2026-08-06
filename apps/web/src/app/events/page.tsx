import { formatEuroFromCents } from "@/lib/money";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { getDefaultOrganization } from "@/lib/commerce/org";
import {
  buildPublicListingCards,
  remainingForCategories,
} from "@/lib/commerce/public-listings";
import { loadPublicListingEvents } from "@/lib/commerce/listing-query";
import { EventsSearchGrid } from "@/components/events-search-grid";
import type { EventCardData } from "@/components/event-card";

/** Live flip of due Vorverkaufsstart must not wait on ISR cache. */
export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function EventsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const org = await getDefaultOrganization();
  const feeConfig = resolveActivePlatformFeeConfig(org?.settings?.platformFeeConfig);

  // Flip due Vorverkaufsstart, then load; search filters client-side for instant feedback.
  const events = await loadPublicListingEvents({ take: 80 });

  const listings = buildPublicListingCards(events);

  const cards: EventCardData[] = listings.map((card) => {
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
    return {
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
    };
  });

  return (
    <div className="tf-container py-8 md:py-10">
      <h1 className="tf-display text-3xl md:text-5xl">Events entdecken</h1>
      <p className="mt-2 max-w-xl text-base text-[var(--tf-text-secondary)]">
        Finde Konzerte und Erlebnisse — nach Künstler, Ort oder Stimmung.
      </p>

      <EventsSearchGrid cards={cards} initialQuery={q} />
    </div>
  );
}
