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
    return new URL(ref).origin;
  } catch {
    return "*";
  }
}

/**
 * Accept parent→iframe messages only from the referrer origin when known;
 * if referrer is empty, keep previous permissive behavior (organizer snippets).
 */
export function isTrustedEmbedParentOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;
  try {
    const ref = typeof document !== "undefined" ? document.referrer?.trim() : "";
    if (!ref) return true;
    return new URL(ref).origin === origin;
  } catch {
    return false;
  }
}
