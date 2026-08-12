import { prisma } from "@/lib/db";
import { cartHasCampaignPrice } from "@/lib/commerce/campaign-promo";
import { resolveDiscountCode, resolveGiftCard } from "@/lib/commerce/discounts";
import { resolveOrderCampaignDiscount } from "@/lib/commerce/event-pricing";
import { loadPriceCampaignsForEvents } from "@/lib/commerce/load-event-pricing";
import { computeOrderPricing } from "@/lib/commerce/order-pricing";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";

type CartLike = {
  organizationId: string;
  currency: string;
  expiresAt: Date;
  discountCode?: string | null;
  giftCardCode?: string | null;
  items: {
    quantity: number;
    unitPriceGrossCents: number;
    eventId: string;
    categoryId?: string;
    priceCampaignId?: string | null;
    category: {
      id?: string;
      taxRate?: { rateBps: number } | null;
      event: {
        id: string;
        ticketTaxRateBasisPoints?: number;
        administrationFeeTaxMode?: string | null;
        administrationFeeCustomTaxRateBasisPoints?: number | null;
        presaleFeeMode?: string | null;
        presaleFeeFixedCents?: number | null;
        presaleFeePercentBps?: number | null;
      };
    };
  }[];
};

export async function priceCart(cart: CartLike) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: cart.organizationId },
  });

  const ticketsGrossCents = cart.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceGrossCents,
    0,
  );
  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  const eventIds = [...new Set(cart.items.map((i) => i.eventId))];

  const campaignsByEventId = await loadPriceCampaignsForEvents(eventIds);
  const orderLines = cart.items.map((item) => ({
    eventId: item.eventId,
    categoryId: item.categoryId ?? item.category.id ?? "",
    quantity: item.quantity,
    unitGrossCents: item.unitPriceGrossCents,
  }));

  const orderCampaign = resolveOrderCampaignDiscount({
    lines: orderLines.filter((l) => l.categoryId),
    campaignsByEventId,
    channel: "online",
  });

  let discountCents = 0;
  let discountLabel: string | null = null;
  let discountCode: string | null = cart.discountCode ?? null;

  // Aktion prices / applied order promos already include campaign discount — do not stack codes.
  const hasCampaign = cartHasCampaignPrice(cart.items) || Boolean(orderCampaign);

  if (discountCode && hasCampaign) {
    discountCode = null;
  }
  if (discountCode) {
    const d = await resolveDiscountCode({
      organizationId: cart.organizationId,
      code: discountCode,
      ticketsGrossCents,
      eventIds,
    });
    if (d) {
      discountCents = d.discountCents;
      discountLabel = d.label;
      discountCode = d.code;
    }
  } else if (orderCampaign) {
    discountCents = orderCampaign.discountCents;
    discountLabel = orderCampaign.label;
  }

  const lines = cart.items.map((item) => {
    const eventTax = item.category.event.ticketTaxRateBasisPoints;
    const categoryTax = item.category.taxRate?.rateBps;
    const taxRateBps =
      typeof categoryTax === "number"
        ? categoryTax
        : typeof eventTax === "number"
          ? eventTax
          : 700;
    return {
      quantity: item.quantity,
      unitGrossCents: item.unitPriceGrossCents,
      taxRateBps,
      feeEligible: true as const,
    };
  });

  // Resolve gift card against tickets+fee preview without gift first
  // Event-level fee tax override when all cart events agree on custom mode
  const feeConfigBase = resolveActivePlatformFeeConfig(settings?.platformFeeConfig);
  const eventFeeModes = cart.items.map((i) => i.category.event.administrationFeeTaxMode);
  const allCustom =
    eventFeeModes.length > 0 && eventFeeModes.every((m) => m === "custom");
  const customBps = cart.items[0]?.category.event.administrationFeeCustomTaxRateBasisPoints;
  const platformFeeConfigRaw =
    allCustom && typeof customBps === "number"
      ? {
          ...feeConfigBase,
          taxMode: "custom" as const,
          customTaxRateBasisPoints: customBps,
        }
      : settings?.platformFeeConfig;

  const preview = computeOrderPricing({
    lines,
    discountCents,
    giftCardAppliedCents: 0,
    platformFeeConfigRaw,
  });

  let giftCardAppliedCents = 0;
  let giftCardCode: string | null = cart.giftCardCode ?? null;
  if (giftCardCode) {
    const g = await resolveGiftCard({
      organizationId: cart.organizationId,
      code: giftCardCode,
      remainingPayableCents: preview.customerTotalCents,
    });
    if (g) {
      giftCardAppliedCents = g.appliedCents;
      giftCardCode = g.code;
    }
  }

  const priced = computeOrderPricing({
    lines,
    discountCents,
    giftCardAppliedCents,
    platformFeeConfigRaw,
  });

  const feeConfig = priced.platformFeeConfig;

  return {
    itemCount,
    ticketsGrossCents: priced.ticketsGrossCents,
    discountCents: priced.discountCents,
    discountCode,
    discountLabel,
    giftCardCode,
    giftCardAppliedCents: priced.giftCardAppliedCents,
    feeGrossCents: priced.administrationFeeGrossCents,
    feeNetCents: priced.administrationFeeNetCents,
    feeTaxCents: priced.administrationFeeTaxCents,
    administrationFeePercentageBasisPoints: priced.administrationFeePercentageBasisPoints,
    administrationFeeTaxAllocations: priced.administrationFeeTaxAllocations,
    calculationVersion: priced.calculationVersion,
    feeSnapshot: priced.feeSnapshot,
    netCents: priced.netCents,
    taxCents: priced.taxCents,
    grossCents: priced.customerTotalCents,
    customerTotalCents: priced.customerTotalCents,
    currency: cart.currency,
    expiresAt: cart.expiresAt,
    feeLabel: priced.feeLabel,
    feeDisplayName: feeConfig.displayName,
    feeCustomerDescription: feeConfig.customerDescription,
    platformFeeConfig: feeConfig,
    lineSplits: priced.lineSplits,
    orderCampaignId: orderCampaign?.campaignId ?? null,
    orderCampaignName: orderCampaign?.campaignName ?? null,
    orderCampaignDisclaimer: orderCampaign?.badgeDisclaimer ?? null,
  };
}
