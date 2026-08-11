import { describe, expect, it } from "vitest";
import { isPublicCommerceTrackingPath } from "@/lib/tracking/paths";

describe("isPublicCommerceTrackingPath", () => {
  it("allows ticket commerce funnel paths", () => {
    expect(isPublicCommerceTrackingPath("/event/show-2026")).toBe(true);
    expect(isPublicCommerceTrackingPath("/events")).toBe(true);
    expect(isPublicCommerceTrackingPath("/tour/sommer")).toBe(true);
    expect(isPublicCommerceTrackingPath("/embed/event/show")).toBe(true);
    expect(isPublicCommerceTrackingPath("/embed/warenkorb")).toBe(true);
    expect(isPublicCommerceTrackingPath("/warenkorb")).toBe(true);
    expect(isPublicCommerceTrackingPath("/checkout")).toBe(true);
    expect(isPublicCommerceTrackingPath("/checkout/pay/order-1")).toBe(true);
    expect(isPublicCommerceTrackingPath("/konto/bestellung/order-1")).toBe(true);
  });

  it("blocks homepage, admin, ops and marketing pages", () => {
    expect(isPublicCommerceTrackingPath("/")).toBe(false);
    expect(isPublicCommerceTrackingPath("/admin")).toBe(false);
    expect(isPublicCommerceTrackingPath("/admin/einstellungen/tracking")).toBe(false);
    expect(isPublicCommerceTrackingPath("/kasse")).toBe(false);
    expect(isPublicCommerceTrackingPath("/scanner")).toBe(false);
    expect(isPublicCommerceTrackingPath("/login")).toBe(false);
    expect(isPublicCommerceTrackingPath("/hilfe")).toBe(false);
    expect(isPublicCommerceTrackingPath("/konto")).toBe(false);
    expect(isPublicCommerceTrackingPath("/datenschutz")).toBe(false);
  });

  it("ignores query/hash and rejects empty", () => {
    expect(isPublicCommerceTrackingPath("/event/x?utm=1#tickets")).toBe(true);
    expect(isPublicCommerceTrackingPath(null)).toBe(false);
    expect(isPublicCommerceTrackingPath(undefined)).toBe(false);
    expect(isPublicCommerceTrackingPath("")).toBe(false);
  });
});
