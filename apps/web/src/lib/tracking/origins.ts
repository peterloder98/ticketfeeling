import { getEmbedFrameAncestors } from "@/lib/embed/public-url";

/**
 * Validate parent↔iframe postMessage origins against EMBED_FRAME_ANCESTORS.
 * When allowlist is `*`, accept any https (and http on localhost) origin.
 */
export function parseOriginAllowlist(raw?: string | null): string[] {
  const fromEnv = (raw ?? process.env.EMBED_FRAME_ANCESTORS)?.trim();
  if (!fromEnv || fromEnv === "*") return ["*"];
  return fromEnv.split(/[\s,]+/).filter(Boolean);
}

export function isOriginAllowed(
  origin: string,
  allowlist: string[] = getEmbedFrameAncestors(),
): boolean {
  if (!origin || origin === "null") return false;
  if (allowlist.includes("*")) {
    try {
      const u = new URL(origin);
      if (u.protocol === "https:") return true;
      if (
        u.protocol === "http:" &&
        (u.hostname === "localhost" ||
          u.hostname === "127.0.0.1" ||
          u.hostname.endsWith(".local"))
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  return allowlist.some((allowed) => {
    try {
      // Exact origin match, or allow listed value without path
      if (allowed === origin) return true;
      const a = new URL(allowed.includes("://") ? allowed : `https://${allowed}`);
      const o = new URL(origin);
      return a.origin === o.origin;
    } catch {
      return false;
    }
  });
}

/** Server-side: prefer allowlist; fall back to referrer-origin match when list is *. */
export function isTrustedEmbedMessageOrigin(input: {
  origin: string;
  referrerOrigin?: string | null;
  allowlist?: string[];
}): boolean {
  const list = input.allowlist ?? getEmbedFrameAncestors();
  if (isOriginAllowed(input.origin, list)) return true;
  if (list.includes("*") && input.referrerOrigin) {
    return input.origin === input.referrerOrigin;
  }
  return false;
}
