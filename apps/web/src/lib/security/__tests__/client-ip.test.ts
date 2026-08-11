import { describe, expect, it } from "vitest";
import {
  clientIpFromRequest,
  firstPublicIpFromForwarded,
  isPublicClientIp,
  normalizePublicClientIp,
} from "@/lib/security/client-ip";

describe("normalizePublicClientIp", () => {
  it("accepts public IPv4", () => {
    expect(normalizePublicClientIp("203.0.113.44")).toBe("203.0.113.44");
  });

  it("rejects private, loopback, and unknown", () => {
    expect(normalizePublicClientIp("10.1.2.3")).toBeNull();
    expect(normalizePublicClientIp("192.168.0.1")).toBeNull();
    expect(normalizePublicClientIp("127.0.0.1")).toBeNull();
    expect(normalizePublicClientIp("::1")).toBeNull();
    expect(normalizePublicClientIp("unknown")).toBeNull();
    expect(normalizePublicClientIp("")).toBeNull();
  });

  it("unwraps IPv4-mapped IPv6", () => {
    expect(normalizePublicClientIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });
});

describe("firstPublicIpFromForwarded", () => {
  it("skips private hops and returns first public", () => {
    expect(
      firstPublicIpFromForwarded("10.0.0.1, 203.0.113.50, 198.51.100.1"),
    ).toBe("203.0.113.50");
  });
});

describe("clientIpFromRequest", () => {
  it("reads x-forwarded-for public client", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.77, 10.0.0.1" },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.77");
  });

  it("falls back to unknown when headers missing", () => {
    const req = new Request("https://example.com");
    expect(clientIpFromRequest(req)).toBe("unknown");
  });
});

describe("isPublicClientIp", () => {
  it("rejects CGNAT and link-local", () => {
    expect(isPublicClientIp("100.64.1.1")).toBe(false);
    expect(isPublicClientIp("169.254.1.1")).toBe(false);
  });
});
