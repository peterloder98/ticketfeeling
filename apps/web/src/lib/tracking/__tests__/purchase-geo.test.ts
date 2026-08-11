import { describe, expect, it } from "vitest";
import { resolvePurchaseGeo } from "@/lib/tracking/purchase";

describe("resolvePurchaseGeo", () => {
  it("uses checkout public IP for online orders", () => {
    const geo = resolvePurchaseGeo({
      channel: "online",
      clientIp: "203.0.113.20",
      clientUserAgent: "Mozilla/5.0",
      billingSnapshot: { country: "AT" },
    });
    expect(geo.ipOverride).toBe("203.0.113.20");
    expect(geo.userAgent).toBe("Mozilla/5.0");
    expect(geo.countryId).toBeNull();
  });

  it("falls back to linked session IP, not inventing city from address", () => {
    const geo = resolvePurchaseGeo({
      channel: "online",
      clientIp: null,
      linkedSessionIp: "198.51.100.9",
      billingSnapshot: { country: "DE", city: "München" },
    });
    expect(geo.ipOverride).toBe("198.51.100.9");
    expect(geo.countryId).toBeNull();
  });

  it("uses country-only when no public IP", () => {
    const geo = resolvePurchaseGeo({
      channel: "online",
      clientIp: "10.0.0.1",
      invoiceCountry: "CH",
    });
    expect(geo.ipOverride).toBeNull();
    expect(geo.countryId).toBe("CH");
  });

  it("omits staff IP/UA for box office and keeps billing country", () => {
    const geo = resolvePurchaseGeo({
      channel: "box_office",
      clientIp: "203.0.113.99",
      clientUserAgent: "Staff Chrome",
      linkedSessionIp: "203.0.113.99",
      billingSnapshot: { country: "DE" },
    });
    expect(geo.ipOverride).toBeNull();
    expect(geo.userAgent).toBeNull();
    expect(geo.countryId).toBe("DE");
  });
});
