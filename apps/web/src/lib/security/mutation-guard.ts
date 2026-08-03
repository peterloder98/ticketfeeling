import { CART_SESSION_HEADER } from "@/lib/commerce/cart-session";

function appHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [
    process.env.NEXTAUTH_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).host.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

/**
 * Mitigate cookie CSRF on mutating cart/checkout APIs.
 * Same-origin / same-site / user-initiated (none) are fine.
 * Cross-site is allowed only with the custom cart session header (embeds),
 * which simple HTML form CSRF cannot set.
 */
export function assertMutationAllowed(request: Request):
  | { ok: true }
  | { ok: false; code: string } {
  const site = (request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (!site || site === "same-origin" || site === "same-site" || site === "none") {
    return { ok: true };
  }

  const cartHeader = request.headers.get(CART_SESSION_HEADER)?.trim();
  if (cartHeader) return { ok: true };

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const host = new URL(origin).host.toLowerCase();
      if (appHosts().has(host)) return { ok: true };
    } catch {
      /* ignore */
    }
  }

  return { ok: false, code: "CSRF_REJECTED" };
}
