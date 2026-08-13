import {
  resolveTicketUnitPrice,
  pickActiveOrderCampaignBadge,
  formatOrderCampaignBadge,
  formatOrderCampaignDisclaimer,
  type PriceCampaignInput,
} from "@/lib/commerce/event-pricing";
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
  /** e.g. „* beim Kauf von 2 Tickets“ */
  saleDisclaimer: string | null;
  campaignName: string | null;
  campaignValidUntil: string | null;
  surchargeLabel: string;
  unitCents: number;
  listCents: number;
};

/**
 * Cheapest online unit across listing categories, with active campaign applied.
 * Used for homepage / events / embed “ab XX €” surfaces.
 * Order-threshold promos keep list unit price but may still show badge/disclaimer.
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
  let bestCategoryId: string | null = null;
  let bestEventId: string | null = null;
  let campaignName: string | null = null;
  let campaignValidUntil: string | null = null;
  let saleBadge: string | null = null;
  let saleDisclaimer: string | null = null;

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
      bestCategoryId = cat.id;
      bestEventId = cat.eventId;
      campaignName = priced.campaignName;
      campaignValidUntil = priced.campaignValidUntil;
      saleBadge =
        priced.listCents > priced.unitCents
          ? priced.campaignBadgeLabel ||
            discountBadgeLabel(priced.listCents, priced.unitCents)
          : null;
      saleDisclaimer = priced.campaignBadgeDisclaimer;
    }
  }

  if (!Number.isFinite(bestUnit)) return null;

  // Order-mode promos: keep „ab“ list price, show badge + fair disclaimer —
  // only if the cheapest category is in the campaign’s category selection.
  if (!saleBadge && bestCategoryId && bestEventId) {
    const orderBadge = pickActiveOrderCampaignBadge({
      categoryIds: [bestCategoryId],
      channel: "online",
      now,
      campaigns: campaignsByEventId.get(bestEventId) ?? [],
    });
    if (orderBadge) {
      saleBadge = formatOrderCampaignBadge(orderBadge);
      saleDisclaimer = formatOrderCampaignDisclaimer(orderBadge);
      campaignName = orderBadge.name;
      campaignValidUntil = orderBadge.validUntil.toISOString();
    }
  }

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
    saleBadge,
    saleDisclaimer,
    campaignName: saleBadge ? campaignName : null,
    campaignValidUntil: saleBadge ? campaignValidUntil : null,
    surchargeLabel: unitLabel.surchargeLabel,
    unitCents: bestUnit,
    listCents: bestList,
  };
}
