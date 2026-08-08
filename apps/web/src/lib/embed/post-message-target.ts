import { getEmbedFrameAncestors } from "@/lib/embed/public-url";
import { isOriginAllowed } from "@/lib/tracking/origins";

/**
 * Prefer the real parent origin (from document.referrer) over `*` when posting
 * height/consent/tracking messages out of the embed iframe.
 * Falls back to `*` when referrer is missing (sandboxed / opaque).
 */
export function embedParentPostMessageTarget(): string {
  if (typeof document === "undefined") return "*";
  try {
    const ref = document.referrer?.trim();
    if (!ref) return "*";
    const origin = new URL(ref).origin;
    const allowlist = getEmbedFrameAncestors();
    if (!allowlist.includes("*") && !isOriginAllowed(origin, allowlist)) {
      // Still post to referrer origin if it framed us (CSP already enforced).
      return origin;
    }
    return origin;
  } catch {
    return "*";
  }
}

/**
 * Accept parent→iframe messages only from allowlisted / referrer origins.
 * When EMBED_FRAME_ANCESTORS is `*`, referrer match (or empty referrer) applies.
 */
export function isTrustedEmbedParentOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;
  const allowlist = getEmbedFrameAncestors();
  if (!allowlist.includes("*")) {
    return isOriginAllowed(origin, allowlist);
  }
  try {
    const ref = typeof document !== "undefined" ? document.referrer?.trim() : "";
    if (!ref) return true;
    return new URL(ref).origin === origin;
  } catch {
    return false;
  }
}
