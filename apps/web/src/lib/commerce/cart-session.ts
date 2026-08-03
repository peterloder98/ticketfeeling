import { cookies } from "next/headers";
import { createSecureToken } from "@/lib/crypto-token";

export const CART_COOKIE = "tf_cart";
export const CART_SESSION_HEADER = "x-cart-session";

export async function readCartSessionKey() {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}

/**
 * Resolve cart session for API routes.
 * Prefer the client backup header over the cookie: in third-party iframes the
 * Partitioned cookie is often missing or replaced by an empty mint, while
 * sessionStorage + x-cart-session still holds the real cart.
 */
export async function readCartSessionKeyFromRequest(request?: Request | null) {
  const fromHeader = request?.headers.get(CART_SESSION_HEADER)?.trim();
  if (fromHeader && /^[A-Za-z0-9_-]{8,128}$/.test(fromHeader)) {
    return fromHeader;
  }
  return readCartSessionKey();
}

/** Mint only on write paths (add-to-cart / getOpenCart creating a cart). */
export async function resolveCartSessionKey(incoming?: string | null) {
  if (incoming) return incoming;
  const existing = await readCartSessionKey();
  if (existing) return existing;
  return createSecureToken(18);
}

/**
 * Cart cookie for first-party + iframe embeds on partner sites.
 * Production: SameSite=None; Secure; Partitioned (CHIPS) for third-party iframes.
 * Dev: Lax (localhost often without HTTPS).
 */
export function cartCookieHeader(sessionKey: string) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return `${CART_COOKIE}=${sessionKey}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${60 * 60 * 24 * 14}`;
  }
  return `${CART_COOKIE}=${sessionKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}
