import { formatEuroFromCents } from "@/lib/money";
import type { PlatformFeeConfig } from "@/lib/commerce/platform-fee";
import { loadPriceCampaignsForEvents } from "@/lib/commerce/load-event-pricing";
import { resolveListingFromPrice } from "@/lib/commerce/listing-from-price";
import {
  remainingForCategories,
  type PublicListingCard,
} from "@/lib/commerce/public-listings";
import { isVipCategory } from "@/lib/commerce/ticket-presentation-shared";
import type { EventCardData } from "@/components/event-card";

function vipNearlySoldOut(
  categories: PublicListingCard["ticketCategories"],
  showRemaining: boolean,
): boolean {
  if (!showRemaining) return false;
  const vipCats = categories.filter((c) => isVipCategory(c.name, c.categoryKind));
  if (vipCats.length === 0) return false;
  const { remaining, capacity } = remainingForCategories(vipCats);
  if (capacity <= 0) return false;
  const ratio = remaining / capacity;
  return remaining <= 10 || ratio <= 0.15;
}

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
    const hasCampaign = Boolean(
      from?.saleBadge || from?.campaignName || from?.saleDisclaimer,
    );
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
      saleDisclaimer: from?.saleDisclaimer ?? null,
      campaignName: from?.campaignName ?? null,
      campaignValidUntil: from?.campaignValidUntil ?? null,
      priceNote: from?.surchargeLabel || null,
      remainingTickets: remaining,
      capacity,
      showRemainingAvailability: card.showRemainingAvailability,
      dateCount: card.dateCount,
      vipNearlySoldOut: vipNearlySoldOut(
        card.ticketCategories,
        card.showRemainingAvailability,
      ),
      artists: card.artists,
      href: card.href,
      ctaLabel: card.ctaLabel,
      hasCampaign,
    };
  });
}
