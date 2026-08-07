/**
 * Campaign Aktionspreise and discount codes must not stack.
 * Campaign wins — reject / ignore promo codes while any line has a campaign price.
 * Gift cards are payment credits and remain allowed.
 */

export const DISCOUNT_CAMPAIGN_ACTIVE = "DISCOUNT_CAMPAIGN_ACTIVE";

export const DISCOUNT_CAMPAIGN_ACTIVE_MESSAGE_DE =
  "Rabattcodes sind nicht mit laufenden Aktionspreisen kombinierbar.";

export function cartHasCampaignPrice(
  items: Array<{ priceCampaignId?: string | null }>,
): boolean {
  return items.some((item) => Boolean(item.priceCampaignId));
}
