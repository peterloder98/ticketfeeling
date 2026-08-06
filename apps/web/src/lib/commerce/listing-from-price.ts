import { resolveTicketUnitPrice, type PriceCampaignInput } from "@/lib/commerce/event-pricing";
import { formatCustomerPriceLabel } from "@/lib/commerce/public-price";
import { discountBadgeLabel } from "@/lib/commerce/campaign-price-ui";

export type ListingCategoryPriceInput = {
  id: string;
  eventId: string;
  priceGrossCents: number;
};

export type ListingFromPrice = {
  /** e.g. "ab 49,00 €" — sale unit when campaign active */
  priceLabel: string;
  /** List "ab …" when on sale, else null */
  listPriceLabel: string | null;
  saleBadge: string | null;
  campaignName: string | null;
  campaignValidUntil: string | null;
  surchargeLabel: string;
  unitCents: number;
  listCents: number;
};

/**
 * Cheapest online unit across listing categories, with active campaign applied.
 * Used for homepage / events / embed “ab XX €” surfaces.
 */
export function resolveListingFromPrice(input: {
  categories: ListingCategoryPriceInput[];
  campaignsByEventId: Map<string, PriceCampaignInput[]>;
  feeConfig: Parameters<typeof formatCustomerPriceLabel>[0]["feeConfig"];
  formatEuro: (cents: number) => string;
  now?: Date;
}): ListingFromPrice | null {
  const { categories, campaignsByEventId, feeConfig, formatEuro } = input;
  const now = input.now ?? new Date();
  if (categories.length === 0) return null;

  let bestUnit = Number.POSITIVE_INFINITY;
  let bestList = Number.POSITIVE_INFINITY;
  let campaignName: string | null = null;
  let campaignValidUntil: string | null = null;

  for (const cat of categories) {
    const campaigns = campaignsByEventId.get(cat.eventId) ?? [];
    const priced = resolveTicketUnitPrice({
      listCents: cat.priceGrossCents,
      categoryId: cat.id,
      channel: "online",
      now,
      campaigns,
      accessibilitySelected: false,
    });
    if (priced.unitCents < bestUnit) {
      bestUnit = priced.unitCents;
      bestList = priced.listCents;
      campaignName = priced.campaignName;
      campaignValidUntil = priced.campaignValidUntil;
    }
  }

  if (!Number.isFinite(bestUnit)) return null;

  const unitLabel = formatCustomerPriceLabel({
    ticketGrossCents: bestUnit,
    feeConfig,
    formatEuro,
    prefix: "ab",
  });
  const onSale = bestList > bestUnit;
  const listLabel = onSale
    ? formatCustomerPriceLabel({
        ticketGrossCents: bestList,
        feeConfig,
        formatEuro,
        prefix: "ab",
      }).totalLabel
    : null;

  return {
    priceLabel: unitLabel.totalLabel,
    listPriceLabel: listLabel,
    saleBadge: onSale ? discountBadgeLabel(bestList, bestUnit) : null,
    campaignName: onSale ? campaignName : null,
    campaignValidUntil: onSale ? campaignValidUntil : null,
    surchargeLabel: unitLabel.surchargeLabel,
    unitCents: bestUnit,
    listCents: bestList,
  };
}
