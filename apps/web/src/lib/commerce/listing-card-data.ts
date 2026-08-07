import { formatEuroFromCents } from "@/lib/money";
import type { PlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { loadPriceCampaignsForEvents } from "@/lib/commerce/load-event-pricing";
import { resolveListingFromPrice } from "@/lib/commerce/listing-from-price";
import {
  remainingForCategories,
  type PublicListingCard,
} from "@/lib/commerce/public-listings";
import type { EventCardData } from "@/components/event-card";

/** Map listing cards → EventCardData with campaign from-price / Aktion badge. */
export async function listingCardsToEventCardData(
  listings: PublicListingCard[],
  feeConfig: Pick<PlatformFeeConfig, "enabled" | "percentageBasisPoints" | "displayName">,
): Promise<EventCardData[]> {
  const eventIds = [...new Set(listings.flatMap((c) => c.eventIds))];
  const campaignsByEventId = await loadPriceCampaignsForEvents(eventIds);

  return listings.map((card) => {
    const { remaining, capacity } = remainingForCategories(card.ticketCategories);
    const from = resolveListingFromPrice({
      categories: card.ticketCategories,
      campaignsByEventId,
      feeConfig,
      formatEuro: formatEuroFromCents,
    });
    return {
      id: card.key,
      slug: card.key,
      name: card.name,
      status: card.status,
      eventStartsAt: card.eventStartsAt,
      whenLabel: card.whenLabel,
      locationName: card.locationName,
      locationCity: card.locationCity,
      coverImageUrl: card.coverImageUrl,
      priceLabel: from?.priceLabel ?? null,
      listPriceLabel: from?.listPriceLabel ?? null,
      saleBadge: from?.saleBadge ?? null,
      campaignName: from?.campaignName ?? null,
      campaignValidUntil: from?.campaignValidUntil ?? null,
      priceNote: from?.surchargeLabel || null,
      remainingTickets: remaining,
      capacity,
      showRemainingAvailability: card.showRemainingAvailability,
      artists: card.artists,
      href: card.href,
      ctaLabel: card.ctaLabel,
    };
  });
}
