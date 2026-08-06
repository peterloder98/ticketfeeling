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

/** Batch-load campaigns for listing cards (homepage / events / embed). */
export async function loadPriceCampaignsForEvents(
  eventIds: string[],
): Promise<Map<string, PriceCampaignInput[]>> {
  const map = new Map<string, PriceCampaignInput[]>();
  const unique = [...new Set(eventIds.filter(Boolean))];
  if (unique.length === 0) return map;

  await ensureEventPricingSchema(prisma);
  try {
    const rows = await prisma.eventPriceCampaign.findMany({
      where: { eventId: { in: unique } },
      include: { categories: { select: { categoryId: true } } },
    });
    for (const id of unique) map.set(id, []);
    for (const row of rows) {
      const list = map.get(row.eventId) ?? [];
      list.push(mapCampaignRow(row));
      map.set(row.eventId, list);
    }
  } catch {
    for (const id of unique) map.set(id, []);
  }
  return map;
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
