import { cookies } from "next/headers";
import { createSecureToken } from "@/lib/crypto-token";

export const CART_COOKIE = "tf_cart";

export async function readCartSessionKey() {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}

export async function resolveCartSessionKey(incoming?: string | null) {
  if (incoming) return incoming;
  const existing = await readCartSessionKey();
  if (existing) return existing;
  return createSecureToken(18);
}

/**
 * Cart cookie for first-party + iframe embeds on partner sites.
 * Production: SameSite=None; Secure (required for third-party iframe context).
 * Dev: Lax (localhost often without HTTPS).
 */
export function cartCookieHeader(sessionKey: string) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return `${CART_COOKIE}=${sessionKey}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${60 * 60 * 24 * 14}`;
  }
  return `${CART_COOKIE}=${sessionKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}
