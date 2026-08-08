/**
 * Central Ticketfeeling tracking event schema.
 * All client/server/embed code must use these names — never invent ad-hoc strings.
 */

export const TF_TRACKING_EVENTS = [
  "page_view",
  "event_page_view",
  "artist_view",
  "ticket_shop_view",
  "ticket_category_view",
  "seat_map_opened",
  "seat_selected",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
  "begin_checkout",
  "customer_data_completed",
  "add_payment_info",
  "purchase_button_clicked",
  "payment_started",
  "payment_failed",
  "payment_abandoned",
  "payment_succeeded",
  "purchase",
  "tickets_issued",
  "purchase_email_sent",
  "refund",
  "consent_updated",
  "embed_ready",
] as const;

export type TfTrackingEventName = (typeof TF_TRACKING_EVENTS)[number];

export function isTfTrackingEventName(value: string): value is TfTrackingEventName {
  return (TF_TRACKING_EVENTS as readonly string[]).includes(value);
}

/** Ops / necessary — logged even without analytics consent. */
export const TF_OPS_EVENTS = new Set<TfTrackingEventName>([
  "payment_started",
  "payment_failed",
  "payment_succeeded",
  "purchase",
  "tickets_issued",
  "purchase_email_sent",
  "refund",
  "consent_updated",
]);

export type Ga4MappedEvent = {
  name: string;
  ecommerce?: boolean;
};

export type MetaMappedEvent = {
  name: string;
  standard: boolean;
};

const GA4_MAP: Partial<Record<TfTrackingEventName, Ga4MappedEvent>> = {
  page_view: { name: "page_view" },
  event_page_view: { name: "view_item", ecommerce: true },
  ticket_shop_view: { name: "view_item_list", ecommerce: true },
  ticket_category_view: { name: "view_item", ecommerce: true },
  add_to_cart: { name: "add_to_cart", ecommerce: true },
  remove_from_cart: { name: "remove_from_cart", ecommerce: true },
  view_cart: { name: "view_cart", ecommerce: true },
  begin_checkout: { name: "begin_checkout", ecommerce: true },
  add_payment_info: { name: "add_payment_info", ecommerce: true },
  purchase: { name: "purchase", ecommerce: true },
  refund: { name: "refund", ecommerce: true },
};

const META_MAP: Partial<Record<TfTrackingEventName, MetaMappedEvent>> = {
  page_view: { name: "PageView", standard: true },
  event_page_view: { name: "ViewContent", standard: true },
  ticket_shop_view: { name: "ViewContent", standard: true },
  add_to_cart: { name: "AddToCart", standard: true },
  begin_checkout: { name: "InitiateCheckout", standard: true },
  add_payment_info: { name: "AddPaymentInfo", standard: true },
  purchase: { name: "Purchase", standard: true },
};

export function mapToGa4(name: TfTrackingEventName): Ga4MappedEvent | null {
  return GA4_MAP[name] ?? null;
}

export function mapToMeta(name: TfTrackingEventName): MetaMappedEvent | null {
  return META_MAP[name] ?? null;
}

export function deliveryDedupeKey(input: {
  channel: string;
  eventName: string;
  transactionId?: string | null;
  eventId: string;
}): string {
  const tx = input.transactionId?.trim();
  if (tx) return `${input.channel}:${input.eventName}:tx:${tx}`;
  return `${input.channel}:${input.eventName}:eid:${input.eventId}`;
}

/** Stable purchase event_id shared by webhook + thank-you (dedupe). */
export function purchaseEventIdForOrder(orderId: string): string {
  // Prefer a real UUID when orderId already is one; otherwise namespace-style fallback.
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRe.test(orderId)) return orderId.toLowerCase();
  // Deterministic UUID v5-ish hex pad (not cryptographic; only for id matching).
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  const hex = (h.toString(16) + orderId.replace(/[^a-f0-9]/gi, "").slice(0, 24)).padEnd(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
