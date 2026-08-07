import { createHmac, timingSafeEqual } from "crypto";

/**
 * Same secret chain as order-access / NextAuth: ORDER_ACCESS_SECRET ||
 * NEXTAUTH_SECRET || AUTH_SECRET (so AUTH_SECRET-only envs still work).
 */
function tapSecret() {
  return (
    process.env.ORDER_ACCESS_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    ""
  );
}

/**
 * Short-lived handoff token so the iOS Tap to Pay companion can fetch a
 * ConnectionToken without a browser session cookie.
 * Format: orderId.exp.sig
 */
export function signBoxOfficeTapHandoff(
  orderId: string,
  ttlMs = 20 * 60 * 1000,
): string | null {
  const secret = tapSecret();
  if (!secret) return null;
  const exp = Date.now() + ttlMs;
  const payload = `box_tap.${orderId}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${orderId}.${exp}.${sig}`;
}

export function verifyBoxOfficeTapHandoff(token: string | null | undefined): {
  ok: boolean;
  orderId?: string;
} {
  if (!token) return { ok: false };
  const secret = tapSecret();
  if (!secret) return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [orderId, expStr, sig] = parts;
  if (!orderId || !sig) return { ok: false };
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false };
  const payload = `box_tap.${orderId}.${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return { ok: false };
    if (!timingSafeEqual(a, b)) return { ok: false };
    return { ok: true, orderId };
  } catch {
    return { ok: false };
  }
}
