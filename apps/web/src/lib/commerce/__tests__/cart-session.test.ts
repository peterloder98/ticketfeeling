import { describe, expect, it } from "vitest";
import { parseCartSessionFromCookieHeader } from "@/lib/commerce/cart-session";

describe("parseCartSessionFromCookieHeader", () => {
  it("reads tf_cart from a Cookie header", () => {
    expect(
      parseCartSessionFromCookieHeader("tf_embed=1; tf_cart=abc12345XYZ_; other=1"),
    ).toBe("abc12345XYZ_");
  });

  it("returns null when missing or invalid", () => {
    expect(parseCartSessionFromCookieHeader(null)).toBeNull();
    expect(parseCartSessionFromCookieHeader("tf_embed=1")).toBeNull();
    expect(parseCartSessionFromCookieHeader("tf_cart=short")).toBeNull();
  });
});
