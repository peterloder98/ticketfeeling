import { prisma } from "@/lib/db";
import {
  mapCampaignRow,
  type AccessibilityOfferInput,
  type PriceCampaignInput,
} from "@/lib/commerce/event-pricing";
import { ensureEventPricingSchema } from "@/lib/commerce/ensure-event-pricing-schema";

export async function loadEventPriceCampaigns(eventId: string): Promise<PriceCampaignInput[]> {
  await ensureEventPricingSchema(prisma);
  try {
    const rows = await prisma.eventPriceCampaign.findMany({
      where: { eventId },
      include: { categories: { select: { categoryId: true } } },
    });
    return rows.map(mapCampaignRow);
  } catch {
    return [];
  }
}

export function accessibilityOfferFromEvent(event: {
  accessibilityDiscountEnabled?: boolean | null;
  accessibilityDiscountLabel?: string | null;
  accessibilityDiscountDescription?: string | null;
  accessibilityDiscountType?: string | null;
  accessibilityDiscountValue?: number | null;
}): AccessibilityOfferInput {
  return {
    enabled: Boolean(event.accessibilityDiscountEnabled),
    label: event.accessibilityDiscountLabel?.trim() || "Rollstuhl / Ermäßigt",
    description: event.accessibilityDiscountDescription ?? null,
    type: event.accessibilityDiscountType === "fixed" ? "fixed" : "percent",
    value: Math.max(0, event.accessibilityDiscountValue ?? 0),
  };
}
