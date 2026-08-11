import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { normalizePublicClientIp } from "@/lib/security/client-ip";
import {
  attributionTouchSnapshot,
  buildFbcFromFbclid,
  parseAttributionFromUnknown,
  sanitizeTrackingUrl,
  type AttributionFields,
} from "@/lib/tracking/attribution";
import {
  deliveryDedupeKey,
  isTfTrackingEventName,
  TF_OPS_EVENTS,
  type TfTrackingEventName,
} from "@/lib/tracking/events";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type UpsertSessionInput = {
  organizationId: string;
  clientSessionId: string;
  visitorId?: string | null;
  embedMode?: boolean;
  attribution?: AttributionFields;
  gaClientId?: string | null;
  gaSessionId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  consentStatistics?: boolean;
  consentMarketing?: boolean;
  userAgent?: string | null;
  clientIp?: string | null;
};

export type LogEventInput = {
  organizationId: string;
  clientSessionId?: string | null;
  eventId?: string | null;
  name: TfTrackingEventName | string;
  source?: "client" | "server" | "embed_parent";
  category?: "funnel" | "ops" | "commerce";
  orderId?: string | null;
  eventSlug?: string | null;
  transactionId?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  payload?: Record<string, unknown>;
  consentStatistics?: boolean;
  consentMarketing?: boolean;
};

function stripPiiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (/email|phone|iban|address|password|firstName|lastName|name/i.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 50);
    else if (v && typeof v === "object") out[k] = stripPiiPayload(v as Record<string, unknown>);
  }
  return out;
}

export async function upsertTrackingSession(input: UpsertSessionInput) {
  if (!isUuid(input.clientSessionId)) {
    throw new Error("INVALID_SESSION_ID");
  }
  const attr = parseAttributionFromUnknown(input.attribution ?? {});
  const fbc =
    input.fbc?.trim() ||
    buildFbcFromFbclid(attr.fbclid) ||
    null;
  const touch = attributionTouchSnapshot(attr);

  const existing = await prisma.trackingSession.findUnique({
    where: {
      organizationId_clientSessionId: {
        organizationId: input.organizationId,
        clientSessionId: input.clientSessionId,
      },
    },
  });

  if (!existing) {
    return prisma.trackingSession.create({
      data: {
        organizationId: input.organizationId,
        clientSessionId: input.clientSessionId,
        visitorId: input.visitorId?.slice(0, 64) ?? null,
        embedMode: Boolean(input.embedMode),
        embedHost: attr.embedHost ?? null,
        parentUrl: sanitizeTrackingUrl(attr.parentUrl) ?? null,
        landingPath: attr.landingPath ?? null,
        referrer: sanitizeTrackingUrl(attr.referrer) ?? null,
        utmSource: attr.utmSource ?? null,
        utmMedium: attr.utmMedium ?? null,
        utmCampaign: attr.utmCampaign ?? null,
        utmTerm: attr.utmTerm ?? null,
        utmContent: attr.utmContent ?? null,
        gclid: attr.gclid ?? null,
        fbclid: attr.fbclid ?? null,
        msclkid: attr.msclkid ?? null,
        ttclid: attr.ttclid ?? null,
        gaClientId: input.gaClientId?.slice(0, 128) ?? null,
        gaSessionId: input.gaSessionId?.slice(0, 128) ?? null,
        fbp: input.fbp?.slice(0, 256) ?? null,
        fbc: fbc?.slice(0, 512) ?? null,
        consentStatistics: Boolean(input.consentStatistics),
        consentMarketing: Boolean(input.consentMarketing),
        firstTouch: touch as Prisma.InputJsonValue,
        lastTouch: touch as Prisma.InputJsonValue,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
        clientIp: normalizePublicClientIp(input.clientIp),
        lastSeenAt: new Date(),
      },
    });
  }

  const firstTouch =
    existing.firstTouch &&
    typeof existing.firstTouch === "object" &&
    !Array.isArray(existing.firstTouch) &&
    Object.keys(existing.firstTouch as object).length > 1
      ? (existing.firstTouch as Prisma.InputJsonValue)
      : (touch as Prisma.InputJsonValue);

  return prisma.trackingSession.update({
    where: { id: existing.id },
    data: {
      visitorId: input.visitorId?.slice(0, 64) ?? existing.visitorId,
      embedMode: input.embedMode ?? existing.embedMode,
      embedHost: attr.embedHost ?? existing.embedHost,
      parentUrl: sanitizeTrackingUrl(attr.parentUrl) ?? existing.parentUrl,
      landingPath: attr.landingPath ?? existing.landingPath,
      referrer: sanitizeTrackingUrl(attr.referrer) ?? existing.referrer,
      utmSource: attr.utmSource ?? existing.utmSource,
      utmMedium: attr.utmMedium ?? existing.utmMedium,
      utmCampaign: attr.utmCampaign ?? existing.utmCampaign,
      utmTerm: attr.utmTerm ?? existing.utmTerm,
      utmContent: attr.utmContent ?? existing.utmContent,
      gclid: attr.gclid ?? existing.gclid,
      fbclid: attr.fbclid ?? existing.fbclid,
      msclkid: attr.msclkid ?? existing.msclkid,
      ttclid: attr.ttclid ?? existing.ttclid,
      gaClientId: input.gaClientId?.slice(0, 128) ?? existing.gaClientId,
      gaSessionId: input.gaSessionId?.slice(0, 128) ?? existing.gaSessionId,
      fbp: input.fbp?.slice(0, 256) ?? existing.fbp,
      fbc: fbc?.slice(0, 512) ?? existing.fbc,
      consentStatistics:
        input.consentStatistics === undefined
          ? existing.consentStatistics
          : Boolean(input.consentStatistics),
      consentMarketing:
        input.consentMarketing === undefined
          ? existing.consentMarketing
          : Boolean(input.consentMarketing),
      firstTouch,
      lastTouch: touch as Prisma.InputJsonValue,
      userAgent: input.userAgent?.slice(0, 512) ?? existing.userAgent,
      clientIp: normalizePublicClientIp(input.clientIp) ?? existing.clientIp,
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Log every relevant action to TF backend first (independent of GA4/Meta).
 * Returns existing row when eventId already stored (idempotent).
 */
export async function logTrackingEvent(input: LogEventInput) {
  if (!isTfTrackingEventName(input.name)) {
    throw new Error(`UNKNOWN_TRACKING_EVENT:${input.name}`);
  }
  const name = input.name as TfTrackingEventName;
  const eventId =
    input.eventId && isUuid(input.eventId) ? input.eventId.toLowerCase() : randomUUID();

  const existing = await prisma.trackingEvent.findUnique({
    where: { eventId },
  });
  if (existing) return { event: existing, created: false };

  let sessionId: string | null = null;
  let consentStatistics = Boolean(input.consentStatistics);
  let consentMarketing = Boolean(input.consentMarketing);

  if (input.clientSessionId && isUuid(input.clientSessionId)) {
    const session = await prisma.trackingSession.findUnique({
      where: {
        organizationId_clientSessionId: {
          organizationId: input.organizationId,
          clientSessionId: input.clientSessionId,
        },
      },
    });
    if (session) {
      sessionId = session.id;
      if (input.consentStatistics === undefined) consentStatistics = session.consentStatistics;
      if (input.consentMarketing === undefined) consentMarketing = session.consentMarketing;
    }
  }

  const ops = TF_OPS_EVENTS.has(name);
  const consentRequired = !ops;
  const consentOk = ops || consentStatistics || consentMarketing;

  const event = await prisma.trackingEvent.create({
    data: {
      organizationId: input.organizationId,
      trackingSessionId: sessionId,
      eventId,
      name,
      source: input.source ?? "client",
      category: input.category ?? (ops ? "ops" : "funnel"),
      orderId: input.orderId ?? null,
      eventSlug: input.eventSlug?.slice(0, 200) ?? null,
      transactionId: input.transactionId?.slice(0, 128) ?? null,
      valueCents: input.valueCents ?? null,
      currency: input.currency?.slice(0, 8) ?? null,
      consentRequired,
      consentOk,
      payload: stripPiiPayload(input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });

  return { event, created: true };
}

export async function claimTrackingDelivery(input: {
  organizationId: string;
  trackingEventId: string;
  channel: string;
  eventName: string;
  transactionId?: string | null;
  eventId: string;
}) {
  const dedupeKey = deliveryDedupeKey({
    channel: input.channel,
    eventName: input.eventName,
    transactionId: input.transactionId,
    eventId: input.eventId,
  });

  try {
    const row = await prisma.trackingDelivery.create({
      data: {
        organizationId: input.organizationId,
        trackingEventId: input.trackingEventId,
        channel: input.channel,
        dedupeKey,
        status: "pending",
        attemptCount: 1,
      },
    });
    return { delivery: row, claimed: true as const };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "P2002") {
      const existing = await prisma.trackingDelivery.findUnique({
        where: { dedupeKey },
      });
      if (existing?.status === "sent") {
        return { delivery: existing, claimed: false as const, reason: "already_sent" as const };
      }
      if (existing && (existing.status === "failed" || existing.status === "retry")) {
        const updated = await prisma.trackingDelivery.update({
          where: { id: existing.id },
          data: {
            status: "pending",
            attemptCount: { increment: 1 },
            lastError: null,
          },
        });
        return { delivery: updated, claimed: true as const, reason: "retry" as const };
      }
      return {
        delivery: existing,
        claimed: false as const,
        reason: "in_flight" as const,
      };
    }
    throw error;
  }
}

export async function markDeliverySent(
  deliveryId: string,
  providerResponse?: Record<string, unknown>,
) {
  return prisma.trackingDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "sent",
      sentAt: new Date(),
      providerResponse: (providerResponse ?? {}) as Prisma.InputJsonValue,
      lastError: null,
    },
  });
}

export async function markDeliveryFailed(deliveryId: string, errorMessage: string) {
  return prisma.trackingDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "failed",
      lastError: errorMessage.slice(0, 2000),
    },
  });
}

export async function markDeliveryRetry(deliveryId: string, errorMessage: string) {
  return prisma.trackingDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "retry",
      lastError: errorMessage.slice(0, 2000),
    },
  });
}
