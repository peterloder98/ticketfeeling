"use client";

import { readConsent, type ConsentState } from "@/lib/consent";
import {
  parseAttributionFromSearchParams,
  type AttributionFields,
} from "@/lib/tracking/attribution";
import type { TfTrackingEventName } from "@/lib/tracking/events";
import {
  buildMetaPixelParams,
  metaPixelEventName,
} from "@/lib/tracking/meta-pixel";
import { isPublicCommerceTrackingPath } from "@/lib/tracking/paths";

const SESSION_KEY = "tf_tracking_session_id";
const VISITOR_KEY = "tf_tracking_visitor_id";
const PARENT_ATTR_KEY = "tf_parent_attribution";
const PARENT_PIXEL_KEY = "tf_parent_pixel_cookies";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateTrackingSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return uuid();
  }
}

export function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return uuid();
  }
}

export function storeParentAttribution(attr: AttributionFields) {
  try {
    sessionStorage.setItem(PARENT_ATTR_KEY, JSON.stringify(attr));
  } catch {
    /* ignore */
  }
}

export function storeParentPixelCookies(input: { fbp?: string | null; fbc?: string | null }) {
  try {
    sessionStorage.setItem(
      PARENT_PIXEL_KEY,
      JSON.stringify({ fbp: input.fbp ?? null, fbc: input.fbc ?? null }),
    );
  } catch {
    /* ignore */
  }
}

export function readParentAttribution(): AttributionFields {
  try {
    const raw = sessionStorage.getItem(PARENT_ATTR_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AttributionFields;
  } catch {
    return {};
  }
}

function readParentPixelCookies(): { fbp: string | null; fbc: string | null } {
  try {
    const raw = sessionStorage.getItem(PARENT_PIXEL_KEY);
    if (!raw) return { fbp: null, fbc: null };
    const parsed = JSON.parse(raw) as { fbp?: string | null; fbc?: string | null };
    return { fbp: parsed.fbp ?? null, fbc: parsed.fbc ?? null };
  } catch {
    return { fbp: null, fbc: null };
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveFbpFbc(): { fbp: string | null; fbc: string | null } {
  const parent = readParentPixelCookies();
  return {
    // Prefer parent-domain cookies (iframe on ticketfeeling.de won't see schlagerfeeling.de cookies)
    fbp: parent.fbp || readCookie("_fbp"),
    fbc: parent.fbc || readCookie("_fbc"),
  };
}

function collectAttribution(): AttributionFields {
  const fromUrl =
    typeof window !== "undefined"
      ? parseAttributionFromSearchParams(new URLSearchParams(window.location.search))
      : {};
  const parent = readParentAttribution();
  return {
    ...parent,
    ...Object.fromEntries(Object.entries(fromUrl).filter(([, v]) => Boolean(v))),
    landingPath:
      parent.landingPath ||
      (typeof window !== "undefined" ? window.location.pathname : null),
    referrer:
      parent.referrer ||
      (typeof document !== "undefined" ? document.referrer || null : null),
  };
}

function contentFromPayload(payload?: Record<string, unknown>) {
  const contentIds = Array.isArray(payload?.contentIds)
    ? (payload!.contentIds as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  const contentName =
    typeof payload?.contentName === "string" ? payload.contentName : null;
  const numItems =
    typeof payload?.numItems === "number"
      ? payload.numItems
      : typeof payload?.quantity === "number"
        ? payload.quantity
        : undefined;
  const contents = Array.isArray(payload?.contents)
    ? (payload!.contents as Array<{ id: string; quantity: number; item_price?: number }>)
    : undefined;
  return { contentIds, contentName, numItems, contents };
}

export type TrackOptions = {
  eventId?: string;
  eventSlug?: string | null;
  orderId?: string | null;
  transactionId?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  payload?: Record<string, unknown>;
  embedMode?: boolean;
};

/**
 * Log to TF backend first, then fire GA4/Meta when consent allows.
 * In embed mode, also postMessage to parent for first-party pixels on organizer domain.
 */
export async function trackTfEvent(
  name: TfTrackingEventName,
  options: TrackOptions = {},
): Promise<{ eventId: string } | null> {
  if (typeof window === "undefined") return null;

  const consent: ConsentState | null = readConsent();
  const clientSessionId = getOrCreateTrackingSessionId();
  const visitorId = getOrCreateVisitorId();
  const eventId = options.eventId || uuid();
  const attribution = collectAttribution();
  const { fbp, fbc } = resolveFbpFbc();
  const embedMode =
    options.embedMode ?? window.location.pathname.startsWith("/embed");
  const metaBits = contentFromPayload(options.payload);

  const body = {
    eventId,
    name,
    clientSessionId,
    visitorId,
    embedMode,
    eventSlug: options.eventSlug,
    orderId: options.orderId,
    transactionId: options.transactionId,
    valueCents: options.valueCents,
    currency: options.currency,
    payload: options.payload,
    attribution,
    consent: consent
      ? { statistics: consent.statistics, marketing: consent.marketing }
      : { statistics: false, marketing: false },
    gaClientId: readCookie("_ga"),
    fbp,
    fbc,
  };

  try {
    await fetch("/api/v1/tracking/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* internal log best-effort */
  }

  const w = window as Window & {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  };

  // Externe Pixel nur auf Commerce-Pfaden; internes Event-Log oben bleibt.
  const allowExternalPixels = isPublicCommerceTrackingPath(window.location.pathname);

  if (allowExternalPixels && consent?.statistics && typeof w.gtag === "function") {
    const params: Record<string, unknown> = {
      event_id: eventId,
      ...(options.payload ?? {}),
    };
    if (options.transactionId) params.transaction_id = options.transactionId;
    if (options.valueCents != null) {
      params.value = options.valueCents / 100;
      params.currency = options.currency || "EUR";
    }
    const gaName =
      name === "purchase"
        ? "purchase"
        : name === "add_to_cart"
          ? "add_to_cart"
          : name === "begin_checkout"
            ? "begin_checkout"
            : name === "add_payment_info"
              ? "add_payment_info"
              : name === "event_page_view" || name === "ticket_shop_view"
                ? "view_item"
                : name;
    w.gtag("event", gaName, params);
  }

  const metaName = metaPixelEventName(name);
  if (allowExternalPixels && consent?.marketing && metaName && typeof w.fbq === "function") {
    const params = buildMetaPixelParams({
      valueCents: options.valueCents,
      currency: options.currency,
      contentIds: metaBits.contentIds,
      contentName: metaBits.contentName,
      numItems: metaBits.numItems,
      contents: metaBits.contents,
    });
    w.fbq("track", metaName, params, { eventID: eventId });
  }

  if (embedMode && window.parent !== window) {
    try {
      const target = document.referrer ? new URL(document.referrer).origin : "*";
      window.parent.postMessage(
        {
          type: "tf:track",
          eventId,
          name,
          metaEvent: metaName,
          valueCents: options.valueCents ?? null,
          currency: options.currency ?? null,
          transactionId: options.transactionId ?? null,
          eventSlug: options.eventSlug ?? null,
          payload: {
            ...(options.payload ?? {}),
            ...buildMetaPixelParams({
              valueCents: options.valueCents,
              currency: options.currency,
              contentIds: metaBits.contentIds,
              contentName: metaBits.contentName,
              numItems: metaBits.numItems,
              contents: metaBits.contents,
            }),
          },
        },
        target,
      );
    } catch {
      /* ignore */
    }
  }

  return { eventId };
}

export async function syncTrackingSession(embedMode?: boolean) {
  if (typeof window === "undefined") return;
  const consent = readConsent();
  const { fbp, fbc } = resolveFbpFbc();
  const body = {
    clientSessionId: getOrCreateTrackingSessionId(),
    visitorId: getOrCreateVisitorId(),
    embedMode: embedMode ?? window.location.pathname.startsWith("/embed"),
    attribution: collectAttribution(),
    consent: consent
      ? { statistics: consent.statistics, marketing: consent.marketing }
      : undefined,
    gaClientId: readCookie("_ga"),
    fbp,
    fbc,
  };
  try {
    await fetch("/api/v1/tracking/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
