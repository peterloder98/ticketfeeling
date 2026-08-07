import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  signOrderAccessToken,
  verifyOrderAccessToken,
} from "@/lib/commerce/order-access";
import {
  signBoxOfficeTapHandoff,
  verifyBoxOfficeTapHandoff,
} from "@/lib/commerce/box-office-tap-token";

describe("HMAC secret chain parity with auth", () => {
  const prev = {
    ORDER_ACCESS_SECRET: process.env.ORDER_ACCESS_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
  };

  beforeEach(() => {
    delete process.env.ORDER_ACCESS_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("signs and verifies with AUTH_SECRET only (no NEXTAUTH_SECRET)", () => {
    process.env.AUTH_SECRET = "auth-only-secret-for-tests-32chars!!";
    const orderId = "11111111-1111-4111-8111-111111111111";
    const token = signOrderAccessToken(orderId);
    expect(token).toBeTruthy();
    expect(verifyOrderAccessToken(orderId, token)).toBe(true);
    expect(verifyOrderAccessToken(orderId, "bad")).toBe(false);
  });

  it("prefers ORDER_ACCESS_SECRET over AUTH_SECRET", () => {
    process.env.AUTH_SECRET = "auth-secret-aaaaaaaaaaaaaaaaaaaa";
    process.env.ORDER_ACCESS_SECRET = "order-secret-bbbbbbbbbbbbbbbbbb";
    const orderId = "22222222-2222-4222-8222-222222222222";
    const token = signOrderAccessToken(orderId);
    expect(verifyOrderAccessToken(orderId, token)).toBe(true);
    delete process.env.ORDER_ACCESS_SECRET;
    expect(verifyOrderAccessToken(orderId, token)).toBe(false);
  });

  it("tap handoff works with AUTH_SECRET only", () => {
    process.env.AUTH_SECRET = "auth-only-secret-for-tap-tests-32c!";
    const orderId = "33333333-3333-4333-8333-333333333333";
    const token = signBoxOfficeTapHandoff(orderId);
    expect(token).toBeTruthy();
    expect(verifyBoxOfficeTapHandoff(token).ok).toBe(true);
    expect(verifyBoxOfficeTapHandoff(token).orderId).toBe(orderId);
  });
});
