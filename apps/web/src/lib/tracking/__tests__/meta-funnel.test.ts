import { describe, expect, it } from "vitest";
import {
  deliveryDedupeKey,
  mapToMeta,
  purchaseEventIdForOrder,
  TF_TRACKING_EVENTS,
} from "@/lib/tracking/events";
import { isOriginAllowed, isTrustedEmbedMessageOrigin } from "@/lib/tracking/origins";
import { buildMetaPixelParams, metaPixelEventName } from "@/lib/tracking/meta-pixel";
import { buildFbcFromFbclid, parseAttributionFromSearchParams } from "@/lib/tracking/attribution";

describe("Meta funnel event mapping", () => {
  it("maps TF names to Meta standard events", () => {
    expect(mapToMeta("event_page_view")?.name).toBe("ViewContent");
    expect(mapToMeta("add_to_cart")?.name).toBe("AddToCart");
    expect(mapToMeta("begin_checkout")?.name).toBe("InitiateCheckout");
    expect(mapToMeta("add_payment_info")?.name).toBe("AddPaymentInfo");
    expect(mapToMeta("purchase")?.name).toBe("Purchase");
  });

  it("exposes the same names via pixel helper", () => {
    expect(metaPixelEventName("add_to_cart")).toBe("AddToCart");
    expect(metaPixelEventName("purchase")).toBe("Purchase");
  });

  it("builds Meta pixel params with content_type product", () => {
    const params = buildMetaPixelParams({
      valueCents: 4990,
      currency: "eur",
      contentIds: ["evt-1"],
      contentName: "Show",
      numItems: 2,
      contents: [{ id: "evt-1", quantity: 2, item_price: 24.95 }],
    });
    expect(params.content_type).toBe("product");
    expect(params.value).toBe(49.9);
    expect(params.currency).toBe("EUR");
    expect(params.content_ids).toEqual(["evt-1"]);
    expect(params.num_items).toBe(2);
  });
});

describe("purchase event_id stability (Pixel ↔ CAPI dedupe)", () => {
  it("uses order UUID as purchase event_id", () => {
    const orderId = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
    expect(purchaseEventIdForOrder(orderId)).toBe(orderId);
    expect(purchaseEventIdForOrder(orderId.toUpperCase())).toBe(orderId);
  });

  it("dedupes Meta purchase on transaction id", () => {
    const a = deliveryDedupeKey({
      channel: "meta_capi",
      eventName: "purchase",
      transactionId: "TF-1001",
      eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    const b = deliveryDedupeKey({
      channel: "meta_capi",
      eventName: "purchase",
      transactionId: "TF-1001",
      eventId: "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    expect(a).toBe(b);
    expect(a).toContain("tx:TF-1001");
  });

  it("does not collide Pixel-mirror with different channel", () => {
    const server = deliveryDedupeKey({
      channel: "meta_capi",
      eventName: "purchase",
      transactionId: "TF-1001",
      eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    const client = deliveryDedupeKey({
      channel: "meta_pixel",
      eventName: "purchase",
      transactionId: "TF-1001",
      eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    expect(server).not.toBe(client);
  });
});

describe("iframe origin validation", () => {
  it("allows https parents when allowlist is *", () => {
    expect(isOriginAllowed("https://schlagerfeeling.de", ["*"])).toBe(true);
    expect(isOriginAllowed("http://evil.example", ["*"])).toBe(false);
  });

  it("enforces allowlist when set", () => {
    const list = ["https://schlagerfeeling.de", "https://www.schlagerfeeling.de"];
    expect(isOriginAllowed("https://schlagerfeeling.de", list)).toBe(true);
    expect(isOriginAllowed("https://evil.example", list)).toBe(false);
  });

  it("trusted message origin uses allowlist", () => {
    expect(
      isTrustedEmbedMessageOrigin({
        origin: "https://schlagerfeeling.de",
        allowlist: ["https://schlagerfeeling.de"],
      }),
    ).toBe(true);
    expect(
      isTrustedEmbedMessageOrigin({
        origin: "https://phish.example",
        allowlist: ["https://schlagerfeeling.de"],
      }),
    ).toBe(false);
  });
});

describe("parent attribution helpers", () => {
  it("parses UTMs and fbclid from search params", () => {
    const params = new URLSearchParams(
      "utm_source=meta&utm_medium=paid&utm_campaign=tour&fbclid=abc123",
    );
    const attr = parseAttributionFromSearchParams(params);
    expect(attr.utmSource).toBe("meta");
    expect(attr.utmCampaign).toBe("tour");
    expect(attr.fbclid).toBe("abc123");
  });

  it("builds fbc from fbclid when cookie missing", () => {
    const fbc = buildFbcFromFbclid("FbClickId");
    expect(fbc).toMatch(/^fb\.1\.\d+\.FbClickId$/);
  });
});

describe("central schema", () => {
  it("includes Meta funnel TF events", () => {
    for (const name of [
      "event_page_view",
      "add_to_cart",
      "begin_checkout",
      "add_payment_info",
      "purchase",
    ] as const) {
      expect(TF_TRACKING_EVENTS).toContain(name);
    }
  });
});
