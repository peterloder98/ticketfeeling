import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("sendGa4MpEvent geo fields", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it("includes ip_override and user_agent when provided", async () => {
    const { sendGa4MpEvent } = await import("@/lib/tracking/ga4-mp");
    const result = await sendGa4MpEvent({
      measurementId: "G-TEST",
      apiSecret: "secret",
      clientId: "1.2",
      eventName: "purchase",
      eventId: "11111111-1111-4111-8111-111111111111",
      transactionId: "TF-1",
      valueCents: 1990,
      currency: "EUR",
      ipOverride: "203.0.113.44",
      userAgent: "Mozilla/5.0 Test",
    });
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.ip_override).toBe("203.0.113.44");
    expect(body.user_agent).toBe("Mozilla/5.0 Test");
    expect(body.events[0].name).toBe("purchase");
  });

  it("omits unknown / empty ip_override", async () => {
    const { sendGa4MpEvent } = await import("@/lib/tracking/ga4-mp");
    await sendGa4MpEvent({
      measurementId: "G-TEST",
      apiSecret: "secret",
      eventName: "purchase",
      eventId: "22222222-2222-4222-8222-222222222222",
      ipOverride: "unknown",
    });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.ip_override).toBeUndefined();
  });
});
