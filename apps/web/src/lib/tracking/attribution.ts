export type AttributionFields = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  referrer?: string | null;
  parentUrl?: string | null;
  embedHost?: string | null;
  landingPath?: string | null;
};

const ATTR_KEYS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "referrer",
  "parentUrl",
  "embedHost",
  "landingPath",
] as const;

function clip(value: unknown, max = 2048): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Strip PII-ish query params from URLs before storage. */
export function sanitizeTrackingUrl(raw: string | null | undefined): string | null {
  const value = clip(raw, 4096);
  if (!value) return null;
  try {
    const u = new URL(value);
    for (const key of [...u.searchParams.keys()]) {
      if (/email|name|phone|address|token|password|iban/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    return u.toString().slice(0, 4096);
  } catch {
    return value;
  }
}

export function parseAttributionFromSearchParams(
  params: URLSearchParams,
): AttributionFields {
  return {
    utmSource: clip(params.get("utm_source"), 200),
    utmMedium: clip(params.get("utm_medium"), 200),
    utmCampaign: clip(params.get("utm_campaign"), 200),
    utmTerm: clip(params.get("utm_term"), 200),
    utmContent: clip(params.get("utm_content"), 200),
    gclid: clip(params.get("gclid"), 500),
    fbclid: clip(params.get("fbclid"), 500),
    msclkid: clip(params.get("msclkid"), 500),
    ttclid: clip(params.get("ttclid"), 500),
  };
}

export function parseAttributionFromUnknown(raw: unknown): AttributionFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: AttributionFields = {};
  for (const key of ATTR_KEYS) {
    const v = clip(o[key] ?? o[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)], 2048);
    if (v) (out as Record<string, string>)[key] = v;
  }
  if (out.parentUrl) out.parentUrl = sanitizeTrackingUrl(out.parentUrl) ?? undefined;
  if (out.referrer) out.referrer = sanitizeTrackingUrl(out.referrer) ?? undefined;
  if (out.landingPath) out.landingPath = clip(out.landingPath, 500) ?? undefined;
  if (out.embedHost) out.embedHost = clip(out.embedHost, 255) ?? undefined;
  return out;
}

export function attributionTouchSnapshot(a: AttributionFields): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const key of ATTR_KEYS) {
    const v = a[key];
    if (v) snap[key] = v;
  }
  snap.at = new Date().toISOString();
  return snap;
}

/** Build Meta fbc from fbclid when cookie missing. */
export function buildFbcFromFbclid(fbclid: string | null | undefined): string | null {
  const id = clip(fbclid, 500);
  if (!id) return null;
  return `fb.1.${Date.now()}.${id}`;
}
