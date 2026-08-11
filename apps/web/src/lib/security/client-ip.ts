/**
 * Client IP extraction + public-IP validation for tracking geo (GA4 MP / Meta CAPI).
 * Never use private/loopback/link-local addresses as ip_override — those geolocate
 * to the wrong place or are Vercel/proxy internals.
 */

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

function stripZoneId(ip: string): string {
  const pct = ip.indexOf("%");
  return pct >= 0 ? ip.slice(0, pct) : ip;
}

/** IPv4-mapped IPv6 → plain IPv4 (e.g. ::ffff:203.0.113.1). */
function unwrapMappedIpv4(ip: string): string {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice("::ffff:".length);
    if (IPV4_RE.test(rest)) return rest;
  }
  return ip;
}

function ipv4ToInt(ip: string): number | null {
  if (!IPV4_RE.test(ip)) return null;
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;
  // 0.0.0.0/8
  if (n >>> 24 === 0) return true;
  // 10.0.0.0/8
  if (n >>> 24 === 10) return true;
  // 127.0.0.0/8
  if (n >>> 24 === 127) return true;
  // 169.254.0.0/16 link-local
  if (n >>> 16 === 0xa9fe) return true;
  // 172.16.0.0/12
  if (n >>> 16 >= 0xac10 && n >>> 16 <= 0xac1f) return true;
  // 192.168.0.0/16
  if (n >>> 16 === 0xc0a8) return true;
  // 100.64.0.0/10 CGNAT
  if (n >>> 22 === 0x191) return true;
  // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  if (n >>> 28 >= 0xe) return true;
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // Unique local fc00::/7, link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true;
  }
  return false;
}

/** True when the address is a usable public client IP for geo override. */
export function isPublicClientIp(value: string): boolean {
  const raw = unwrapMappedIpv4(stripZoneId(value.trim()));
  if (!raw || raw === "unknown") return false;
  if (IPV4_RE.test(raw)) return !isPrivateOrReservedIpv4(raw);
  // Loose IPv6 shape check — reject obvious private/local; accept global unicast.
  if (raw.includes(":")) {
    if (isPrivateOrReservedIpv6(raw)) return false;
    // Must look like hex:colon (reject garbage)
    if (!/^[0-9a-f:]+$/i.test(raw)) return false;
    return true;
  }
  return false;
}

/**
 * Normalize + validate for storage / ip_override.
 * Returns null for unknown, empty, or non-public addresses.
 */
export function normalizePublicClientIp(value?: string | null): string | null {
  const ip = value?.trim();
  if (!ip || ip === "unknown") return null;
  const cleaned = unwrapMappedIpv4(stripZoneId(ip)).slice(0, 64);
  if (!isPublicClientIp(cleaned)) return null;
  return cleaned;
}

/**
 * Pick the left-most public IP from a forwarded chain (client → proxies).
 * Skips private hops so a misconfigured proxy does not poison geo.
 */
export function firstPublicIpFromForwarded(headerValue: string | null | undefined): string | null {
  if (!headerValue?.trim()) return null;
  for (const part of headerValue.split(",")) {
    const candidate = normalizePublicClientIp(part);
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Client IP from Edge/proxy headers (Vercel sets x-forwarded-for).
 * Prefers public addresses; returns "unknown" when none (rate-limit compatible).
 */
export function clientIpFromRequest(request: Request): string {
  const headers = [
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-vercel-forwarded-for"),
  ];
  for (const h of headers) {
    const ip = firstPublicIpFromForwarded(h);
    if (ip) return ip;
  }
  // Fall back to raw first hop even if private (rate limiting still needs a key)
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}
