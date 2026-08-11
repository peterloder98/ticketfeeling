import { NextResponse } from "next/server";
import { z } from "zod";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { parseAttributionFromUnknown } from "@/lib/tracking/attribution";
import { isTfTrackingEventName, mapToMeta } from "@/lib/tracking/events";
import { logTrackingEvent, upsertTrackingSession } from "@/lib/tracking/service";
import { dispatchMetaCapiFunnelEvent } from "@/lib/tracking/meta-funnel";
import { clientIpFromRequest } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const META_FUNNEL_CLIENT = new Set([
  "event_page_view",
  "ticket_shop_view",
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
  // purchase CAPI is authoritative on server fulfill — client may still Pixel-mirror
]);

const bodySchema = z.object({
  eventId: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  clientSessionId: z.string().uuid(),
  visitorId: z.string().max(64).optional().nullable(),
  embedMode: z.boolean().optional(),
  eventSlug: z.string().max(200).optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  transactionId: z.string().max(128).optional().nullable(),
  valueCents: z.number().int().optional().nullable(),
  currency: z.string().max(8).optional().nullable(),
  payload: z.record(z.unknown()).optional(),
  attribution: z.record(z.unknown()).optional(),
  consent: z
    .object({
      statistics: z.boolean(),
      marketing: z.boolean(),
    })
    .optional(),
  gaClientId: z.string().max(128).optional().nullable(),
  gaSessionId: z.string().max(128).optional().nullable(),
  fbp: z.string().max(256).optional().nullable(),
  fbc: z.string().max(512).optional().nullable(),
});

/**
 * Client → TF internal tracking ingest (always).
 * Meta CAPI for funnel stages when marketing consent + mapped event.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  if (!isTfTrackingEventName(parsed.data.name)) {
    return NextResponse.json({ error: "unknown_event" }, { status: 400 });
  }

  const org = await getDefaultOrganization();
  if (!org) {
    return NextResponse.json({ error: "org_missing" }, { status: 503 });
  }

  const ua = request.headers.get("user-agent");
  const clientIp = clientIpFromRequest(request);
  const attr = parseAttributionFromUnknown(parsed.data.attribution ?? {});
  const marketing = Boolean(parsed.data.consent?.marketing);

  await upsertTrackingSession({
    organizationId: org.id,
    clientSessionId: parsed.data.clientSessionId,
    visitorId: parsed.data.visitorId,
    embedMode: parsed.data.embedMode,
    attribution: attr,
    gaClientId: parsed.data.gaClientId,
    gaSessionId: parsed.data.gaSessionId,
    fbp: parsed.data.fbp,
    fbc: parsed.data.fbc,
    consentStatistics: parsed.data.consent?.statistics,
    consentMarketing: parsed.data.consent?.marketing,
    userAgent: ua,
    clientIp,
  });

  const { event, created } = await logTrackingEvent({
    organizationId: org.id,
    clientSessionId: parsed.data.clientSessionId,
    eventId: parsed.data.eventId,
    name: parsed.data.name,
    source: "client",
    orderId: parsed.data.orderId,
    eventSlug: parsed.data.eventSlug,
    transactionId: parsed.data.transactionId,
    valueCents: parsed.data.valueCents,
    currency: parsed.data.currency,
    payload: parsed.data.payload,
    consentStatistics: parsed.data.consent?.statistics,
    consentMarketing: parsed.data.consent?.marketing,
  });

  let metaCapi: { status: string; stub?: boolean } | null = null;
  if (
    created &&
    marketing &&
    META_FUNNEL_CLIENT.has(parsed.data.name) &&
    mapToMeta(parsed.data.name)
  ) {
    const payload = parsed.data.payload ?? {};
    const contentIds = Array.isArray(payload.contentIds)
      ? (payload.contentIds as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined;
    metaCapi = await dispatchMetaCapiFunnelEvent({
      organizationId: org.id,
      trackingEventId: event.id,
      eventId: event.eventId,
      name: parsed.data.name,
      clientSessionId: parsed.data.clientSessionId,
      eventSlug: parsed.data.eventSlug,
      valueCents: parsed.data.valueCents,
      currency: parsed.data.currency,
      contentIds,
      contentName: typeof payload.contentName === "string" ? payload.contentName : null,
      numItems:
        typeof payload.numItems === "number"
          ? payload.numItems
          : typeof payload.quantity === "number"
            ? payload.quantity
            : null,
      eventSourceUrl: attr.parentUrl || null,
      consentMarketing: marketing,
    }).catch(() => ({ status: "failed" }));
  }

  return NextResponse.json({
    ok: true,
    eventId: event.eventId,
    created,
    metaCapi,
  });
}
