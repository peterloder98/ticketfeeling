import { cookies } from "next/headers";
import { createSecureToken } from "@/lib/crypto-token";

export const CART_COOKIE = "tf_cart";
export const CART_SESSION_HEADER = "x-cart-session";

const SESSION_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export async function readCartSessionKey() {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}

/** Parse `tf_cart` from a raw Cookie request header (Route Handler–safe). */
export function parseCartSessionFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)tf_cart=([^;]*)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return SESSION_KEY_RE.test(decoded) ? decoded : null;
  } catch {
    return SESSION_KEY_RE.test(raw) ? raw : null;
  }
}

/**
 * Ordered session candidates for API routes.
 * 1) x-cart-session (embed / sessionStorage backup)
 * 2) Cookie header on the request (reliable in Route Handlers)
 * 3) next/headers cookies() jar
 *
 * Callers that need cart items (seat map held_by_you) should try each until
 * an open cart with items is found — a stale header must not mask a valid cookie.
 */
export async function readCartSessionCandidatesFromRequest(
  request?: Request | null,
): Promise<string[]> {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const v = value?.trim();
    if (v && SESSION_KEY_RE.test(v) && !out.includes(v)) out.push(v);
  };

  push(request?.headers.get(CART_SESSION_HEADER));
  push(parseCartSessionFromCookieHeader(request?.headers.get("cookie")));
  push(await readCartSessionKey());
  return out;
}

/**
 * Resolve cart session for API routes.
 * Prefer the client backup header over the cookie: in third-party iframes the
 * Partitioned cookie is often missing or replaced by an empty mint, while
 * sessionStorage + x-cart-session still holds the real cart.
 */
export async function readCartSessionKeyFromRequest(request?: Request | null) {
  const candidates = await readCartSessionCandidatesFromRequest(request);
  return candidates[0] ?? null;
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
