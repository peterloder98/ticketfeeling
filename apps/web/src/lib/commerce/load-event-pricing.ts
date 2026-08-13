import { prisma } from "@/lib/db";
import {
  mapCampaignRow,
  type AccessibilityOfferInput,
  type PriceCampaignInput,
} from "@/lib/commerce/event-pricing";
import {
  ensureCriticalCampaignColumns,
  ensureEventPricingSchema,
} from "@/lib/commerce/ensure-event-pricing-schema";

/** Fill empty category links (orphaned after category recreate) with all event categories. */
function withCategoryFallback(
  row: {
    id: string;
    name: string;
    active: boolean;
    validFrom: Date;
    validUntil: Date;
    type: string;
    value: number;
    channels: string;
    applyMode?: string | null;
    minQuantity?: number | null;
    badgeLabel?: string | null;
    badgeDisclaimer?: string | null;
    categories: { categoryId: string }[];
  },
  fallbackCategoryIds: string[],
): PriceCampaignInput {
  const mapped = mapCampaignRow(row);
  if (mapped.categoryIds.length === 0 && fallbackCategoryIds.length > 0) {
    mapped.categoryIds = fallbackCategoryIds;
  }
  return mapped;
}

async function loadCampaignRowsForEvents(eventIds: string[]) {
  return prisma.eventPriceCampaign.findMany({
    where: { eventId: { in: eventIds } },
    include: { categories: { select: { categoryId: true } } },
  });
}

export async function loadEventPriceCampaigns(eventId: string): Promise<PriceCampaignInput[]> {
  await ensureEventPricingSchema(prisma);
  try {
    const [rows, categories] = await Promise.all([
      loadCampaignRowsForEvents([eventId]),
      prisma.eventTicketCategory.findMany({
        where: { eventId, status: "active" },
        select: { id: true },
      }),
    ]);
    const fallback = categories.map((c) => c.id);
    return rows.map((row) => withCategoryFallback(row, fallback));
  } catch (err) {
    console.error("[loadEventPriceCampaigns]", eventId, err);
    // Schema lag (P2022): land critical columns and retry once.
    try {
      await ensureCriticalCampaignColumns(prisma);
      const [rows, categories] = await Promise.all([
        loadCampaignRowsForEvents([eventId]),
        prisma.eventTicketCategory.findMany({
          where: { eventId, status: "active" },
          select: { id: true },
        }),
      ]);
      const fallback = categories.map((c) => c.id);
      return rows.map((row) => withCategoryFallback(row, fallback));
    } catch (retryErr) {
      console.error("[loadEventPriceCampaigns] retry failed", eventId, retryErr);
      return [];
    }
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
    const [rows, categories] = await Promise.all([
      loadCampaignRowsForEvents(unique),
      prisma.eventTicketCategory.findMany({
        where: { eventId: { in: unique }, status: "active" },
        select: { id: true, eventId: true },
      }),
    ]);
    const fallbackByEvent = new Map<string, string[]>();
    for (const id of unique) {
      map.set(id, []);
      fallbackByEvent.set(id, []);
    }
    for (const cat of categories) {
      const list = fallbackByEvent.get(cat.eventId) ?? [];
      list.push(cat.id);
      fallbackByEvent.set(cat.eventId, list);
    }
    for (const row of rows) {
      const list = map.get(row.eventId) ?? [];
      list.push(withCategoryFallback(row, fallbackByEvent.get(row.eventId) ?? []));
      map.set(row.eventId, list);
    }
  } catch (err) {
    console.error("[loadPriceCampaignsForEvents]", err);
    try {
      await ensureCriticalCampaignColumns(prisma);
      const rows = await loadCampaignRowsForEvents(unique);
      for (const id of unique) map.set(id, []);
      for (const row of rows) {
        const list = map.get(row.eventId) ?? [];
        list.push(mapCampaignRow(row));
        map.set(row.eventId, list);
      }
    } catch (retryErr) {
      console.error("[loadPriceCampaignsForEvents] retry failed", retryErr);
      for (const id of unique) map.set(id, []);
    }
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
