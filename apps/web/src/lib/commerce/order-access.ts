import { createHmac, timingSafeEqual } from "crypto";

function accessSecret() {
  return (
    process.env.ORDER_ACCESS_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    ""
  );
}

/**
 * Short-lived HMAC capability for guest post-checkout access
 * (pay page + order confirmation). Not a substitute for login long-term.
 */
export function signOrderAccessToken(
  orderId: string,
  ttlMs = 2 * 60 * 60 * 1000,
): string | null {
  const secret = accessSecret();
  if (!secret) return null;
  const exp = Date.now() + ttlMs;
  const payload = `${orderId}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyOrderAccessToken(
  orderId: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const secret = accessSecret();
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (!sig || sig.length < 16) return false;
  const payload = `${orderId}.${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function withOrderAccessQuery(path: string, token: string | null | undefined) {
  if (!token) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}t=${encodeURIComponent(token)}`;
}
