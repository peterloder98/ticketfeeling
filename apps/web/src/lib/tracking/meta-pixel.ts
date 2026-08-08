import { mapToMeta, type TfTrackingEventName } from "@/lib/tracking/events";

/** Meta standard names for Pixel + parent bridge. */
export function metaPixelEventName(name: TfTrackingEventName): string | null {
  return mapToMeta(name)?.name ?? null;
}

export function buildMetaPixelParams(input: {
  valueCents?: number | null;
  currency?: string | null;
  contentIds?: string[];
  contentName?: string | null;
  numItems?: number | null;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {
    content_type: "product",
  };
  if (input.valueCents != null) {
    params.value = Math.round(input.valueCents) / 100;
    params.currency = (input.currency || "EUR").toUpperCase();
  } else if (input.currency) {
    params.currency = input.currency.toUpperCase();
  }
  if (input.contentIds?.length) params.content_ids = input.contentIds;
  if (input.contentName) params.content_name = input.contentName;
  if (input.numItems != null) params.num_items = input.numItems;
  if (input.contents?.length) params.contents = input.contents;
  return params;
}
