import { mapToGa4, type TfTrackingEventName } from "@/lib/tracking/events";

export type Ga4MpEventInput = {
  measurementId: string;
  apiSecret: string;
  clientId?: string | null;
  sessionId?: string | null;
  eventName: TfTrackingEventName;
  eventId: string;
  transactionId?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  items?: Array<{
    item_id?: string;
    item_name?: string;
    price?: number;
    quantity?: number;
  }>;
  params?: Record<string, string | number | boolean>;
  /** Buyer IP — GA4 derives city/region (avoids server/Vercel datacenter geo). */
  ipOverride?: string | null;
  /** Buyer User-Agent for device reports. */
  userAgent?: string | null;
};

export function resolveGa4ApiSecret(): string | null {
  return (
    process.env.GA4_API_SECRET?.trim() ||
    process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET?.trim() ||
    null
  );
}

/**
 * GA4 Measurement Protocol — complement to browser hits; shares event_id for dedupe.
 */
export async function sendGa4MpEvent(input: Ga4MpEventInput): Promise<{
  ok: boolean;
  stub?: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}> {
  const mapped = mapToGa4(input.eventName);
  if (!mapped) {
    return { ok: false, error: "EVENT_NOT_MAPPED_TO_GA4" };
  }
  if (!input.measurementId || !input.apiSecret) {
    return { ok: true, stub: true, body: { reason: "ga4_mp_not_configured" } };
  }

  const clientId =
    input.clientId?.trim() ||
    `tf.${input.eventId.replace(/-/g, "").slice(0, 16)}.${Date.now()}`;

  const params: Record<string, unknown> = {
    ...(input.params ?? {}),
    engagement_time_msec: 1,
  };
  if (input.sessionId) params.session_id = input.sessionId;
  if (mapped.ecommerce && input.transactionId) {
    params.transaction_id = input.transactionId;
  }
  if (input.valueCents != null) {
    params.value = Math.round(input.valueCents) / 100;
    params.currency = (input.currency || "EUR").toUpperCase();
  }
  if (input.items?.length) params.items = input.items;

  const ipOverride = normalizeIp(input.ipOverride);
  const userAgent = input.userAgent?.trim().slice(0, 512) || null;

  const body: Record<string, unknown> = {
    client_id: clientId,
    events: [
      {
        name: mapped.name,
        params: {
          ...params,
          // GA4 event_id for deduplication with browser
          event_id: input.eventId,
        },
      },
    ],
  };
  // Without these, MP hits are geolocated to the server egress (e.g. Vercel fra1 → Frankfurt).
  if (ipOverride) body.ip_override = ipOverride;
  if (userAgent) body.user_agent = userAgent;

  const url =
    `https://www.google-analytics.com/mp/collect` +
    `?measurement_id=${encodeURIComponent(input.measurementId)}` +
    `&api_secret=${encodeURIComponent(input.apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // MP returns 204 empty on success
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, body: { status: res.status } };
    }
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: text.slice(0, 500) || `HTTP_${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "ga4_mp_fetch_failed",
    };
  }
}

function normalizeIp(value?: string | null): string | null {
  const ip = value?.trim();
  if (!ip || ip === "unknown") return null;
  return ip.slice(0, 64);
}
