import { prisma } from "@/lib/db";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { normalizePublicClientIp } from "@/lib/security/client-ip";
import { resolveTrackingConfig } from "@/lib/tracking/config";
import { purchaseEventIdForOrder } from "@/lib/tracking/events";
import {
  normalizeCountryId,
  resolveGa4ApiSecret,
  sendGa4MpEvent,
} from "@/lib/tracking/ga4-mp";
import { resolveMetaCapiAccessToken, sendMetaCapiEvent } from "@/lib/tracking/meta-capi";
import {
  claimTrackingDelivery,
  logTrackingEvent,
  markDeliveryFailed,
  markDeliverySent,
} from "@/lib/tracking/service";

type PurchaseGeo = {
  /** Public buyer IP only — never staff / private / Vercel. */
  ipOverride: string | null;
  userAgent: string | null;
  /** Country-only when no IP (box office or missing capture). */
  countryId: string | null;
};

function countryFromOrder(order: {
  channel: string;
  invoiceCountry: string | null;
  billingSnapshot: unknown;
}): string | null {
  const fromInvoice = normalizeCountryId(order.invoiceCountry);
  if (fromInvoice) return fromInvoice;
  if (order.billingSnapshot && typeof order.billingSnapshot === "object") {
    const country = (order.billingSnapshot as { country?: unknown }).country;
    if (typeof country === "string") return normalizeCountryId(country);
  }
  return null;
}

/**
 * Resolve geo for server purchase MP/CAPI.
 * - Online: checkout-captured public IP (order) → linked tracking session IP → country fallback
 * - Box office (Kasse): never staff IP/UA — country from billing only
 */
export function resolvePurchaseGeo(input: {
  channel: string;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  invoiceCountry?: string | null;
  billingSnapshot?: unknown;
  linkedSessionIp?: string | null;
  linkedSessionUserAgent?: string | null;
}): PurchaseGeo {
  const isBoxOffice = input.channel === "box_office";
  const countryId = countryFromOrder({
    channel: input.channel,
    invoiceCountry: input.invoiceCountry ?? null,
    billingSnapshot: input.billingSnapshot ?? null,
  });

  if (isBoxOffice) {
    return {
      ipOverride: null,
      userAgent: null,
      countryId,
    };
  }

  const ipOverride =
    normalizePublicClientIp(input.clientIp) ||
    normalizePublicClientIp(input.linkedSessionIp);

  return {
    ipOverride,
    userAgent:
      input.clientUserAgent?.trim().slice(0, 512) ||
      input.linkedSessionUserAgent?.trim().slice(0, 512) ||
      null,
    // Country only when IP missing — prefer IP-derived city/region over address guess
    countryId: ipOverride ? null : countryId,
  };
}

/**
 * Authoritative purchase conversion — call when order is paid/fulfilled (webhook path).
 * Browser thank-you may mirror with the same event_id; deliveries dedupe.
 */
export async function recordServerPurchaseConversion(orderId: string): Promise<{
  eventId: string;
  created: boolean;
  deliveries: Array<{ channel: string; status: string; stub?: boolean }>;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { id: true, email: true } },
      items: {
        select: {
          eventId: true,
          productNameSnapshot: true,
          eventNameSnapshot: true,
          quantity: true,
          unitPaidGrossCents: true,
          grossCents: true,
          event: {
            select: {
              slug: true,
              trackingUseOrgDefaults: true,
              trackingGa4MeasurementId: true,
              trackingGtmContainerId: true,
              trackingMetaPixelId: true,
              trackingGoogleAdsId: true,
              trackingReviewedAt: true,
            },
          },
        },
      },
      organization: {
        select: {
          settings: {
            select: {
              trackingEnabled: true,
              trackingGa4MeasurementId: true,
              trackingGtmContainerId: true,
              trackingMetaPixelId: true,
              trackingGoogleAdsId: true,
              trackingMetaCapiTokenEnc: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const paid =
    order.paymentStatus === "paid" ||
    order.status === "paid" ||
    order.status === "fulfilled" ||
    Boolean(order.fulfillmentLockedAt);
  if (!paid) {
    throw new Error("ORDER_NOT_PAID");
  }

  const eventId = purchaseEventIdForOrder(order.id);
  const transactionId = order.orderNumber || order.id;
  const primaryEvent = order.items[0]?.event ?? null;
  const config = resolveTrackingConfig(order.organization.settings, primaryEvent);
  const valueCents = order.customerTotalCents || order.grossCents;
  const currency = order.currency || "EUR";

  const { event, created } = await logTrackingEvent({
    organizationId: order.organizationId,
    eventId,
    name: "purchase",
    source: "server",
    category: "commerce",
    orderId: order.id,
    eventSlug: primaryEvent?.slug ?? null,
    transactionId,
    valueCents,
    currency,
    consentStatistics: true,
    consentMarketing: true,
    payload: {
      channel: order.channel,
      itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
      paymentProvider: order.paymentProvider,
    },
  });

  // Always log tickets_issued as ops companion (idempotent via separate event id)
  await logTrackingEvent({
    organizationId: order.organizationId,
    eventId: purchaseEventIdForOrder(`${order.id}:tickets_issued`),
    name: "tickets_issued",
    source: "server",
    category: "ops",
    orderId: order.id,
    transactionId,
    valueCents,
    currency,
    payload: { ticketCount: order.items.reduce((n, i) => n + i.quantity, 0) },
  }).catch(() => null);

  const deliveries: Array<{ channel: string; status: string; stub?: boolean }> = [];

  // Prefer session tied to this order for IP/UA. Org-latest is only for ga/fbp ids (legacy).
  const linkedEvent = await prisma.trackingEvent.findFirst({
    where: {
      organizationId: order.organizationId,
      orderId: order.id,
      trackingSessionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { trackingSessionId: true },
  });
  const linkedSession = linkedEvent?.trackingSessionId
    ? await prisma.trackingSession.findUnique({
        where: { id: linkedEvent.trackingSessionId },
      })
    : null;
  const recentSession =
    linkedSession ??
    (await prisma.trackingSession.findFirst({
      where: { organizationId: order.organizationId },
      orderBy: { lastSeenAt: "desc" },
    }));

  const geo = resolvePurchaseGeo({
    channel: order.channel,
    clientIp: order.clientIp,
    clientUserAgent: order.clientUserAgent,
    invoiceCountry: order.invoiceCountry,
    billingSnapshot: order.billingSnapshot,
    // Never use org-wide session IP — that would geolocate to a random visitor.
    linkedSessionIp: linkedSession?.clientIp,
    linkedSessionUserAgent: linkedSession?.userAgent,
  });

  const items = order.items.map((item) => ({
    item_id: item.eventId,
    item_name: item.eventNameSnapshot || item.productNameSnapshot,
    price: item.unitPaidGrossCents / 100,
    quantity: item.quantity,
  }));

  // Meta CAPI Purchase
  {
    const claim = await claimTrackingDelivery({
      organizationId: order.organizationId,
      trackingEventId: event.id,
      channel: "meta_capi",
      eventName: "purchase",
      transactionId,
      eventId,
    });
    if (!claim.claimed) {
      deliveries.push({
        channel: "meta_capi",
        status: claim.delivery?.status ?? "skipped",
      });
    } else if (claim.delivery) {
      const token = resolveMetaCapiAccessToken(
        order.organization.settings?.trackingMetaCapiTokenEnc,
      );
      const pixelId = config.metaPixelId;
      const result = await sendMetaCapiEvent({
        pixelId: pixelId || "",
        accessToken: token || "",
        eventName: "purchase",
        eventId,
        eventSourceUrl: `${getPublicAppUrl()}/konto/bestellung/${order.id}`,
        actionSource: "website",
        valueCents,
        currency,
        contentIds: order.items.map((i) => i.eventId),
        contentName: order.items[0]?.eventNameSnapshot ?? null,
        numItems: order.items.reduce((n, i) => n + i.quantity, 0),
        userData: {
          email: order.customer.email.includes("@ticketfeeling.local")
            ? null
            : order.customer.email,
          externalId: order.customer.id,
          fbp: recentSession?.fbp,
          fbc: recentSession?.fbc,
          userAgent: geo.userAgent,
          clientIp: geo.ipOverride,
          country: geo.countryId,
        },
        testEventCode: process.env.META_TEST_EVENT_CODE?.trim() || null,
      });
      if (result.ok) {
        await markDeliverySent(claim.delivery.id, {
          stub: Boolean(result.stub),
          body: result.body,
        });
        deliveries.push({
          channel: "meta_capi",
          status: "sent",
          stub: Boolean(result.stub),
        });
      } else {
        await markDeliveryFailed(claim.delivery.id, result.error || "meta_capi_failed");
        deliveries.push({ channel: "meta_capi", status: "failed" });
      }
    }
  }

  // GA4 Measurement Protocol Purchase
  {
    const claim = await claimTrackingDelivery({
      organizationId: order.organizationId,
      trackingEventId: event.id,
      channel: "ga4_mp",
      eventName: "purchase",
      transactionId,
      eventId,
    });
    if (!claim.claimed) {
      deliveries.push({
        channel: "ga4_mp",
        status: claim.delivery?.status ?? "skipped",
      });
    } else if (claim.delivery) {
      const apiSecret = resolveGa4ApiSecret();
      const measurementId = config.ga4MeasurementId;
      const result = await sendGa4MpEvent({
        measurementId: measurementId || "",
        apiSecret: apiSecret || "",
        clientId: recentSession?.gaClientId,
        sessionId: recentSession?.gaSessionId,
        eventName: "purchase",
        eventId,
        transactionId,
        valueCents,
        currency,
        items,
        ipOverride: geo.ipOverride,
        userAgent: geo.userAgent,
        userLocation: geo.countryId ? { countryId: geo.countryId } : null,
      });
      if (result.ok) {
        await markDeliverySent(claim.delivery.id, {
          stub: Boolean(result.stub),
          body: result.body,
        });
        deliveries.push({
          channel: "ga4_mp",
          status: "sent",
          stub: Boolean(result.stub),
        });
      } else {
        await markDeliveryFailed(claim.delivery.id, result.error || "ga4_mp_failed");
        deliveries.push({ channel: "ga4_mp", status: "failed" });
      }
    }
  }

  // Meta InitiateCheckout is optional — only when we have a begin_checkout event earlier.
  // Purchase path is P0; InitiateCheckout fires from client/API with consent.

  return { eventId, created, deliveries };
}

/**
 * Best-effort InitiateCheckout CAPI (consent-gated caller).
 */
export async function recordInitiateCheckoutServer(input: {
  organizationId: string;
  eventId: string;
  clientSessionId?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  eventSlug?: string | null;
  contentIds?: string[];
}) {
  const { event, created } = await logTrackingEvent({
    organizationId: input.organizationId,
    eventId: input.eventId,
    clientSessionId: input.clientSessionId,
    name: "begin_checkout",
    source: "server",
    category: "funnel",
    eventSlug: input.eventSlug,
    valueCents: input.valueCents,
    currency: input.currency,
    payload: { contentIds: input.contentIds },
  });

  const org = await prisma.organizationSettings.findUnique({
    where: { organizationId: input.organizationId },
  });
  const config = resolveTrackingConfig(org);
  const token = resolveMetaCapiAccessToken(org?.trackingMetaCapiTokenEnc);
  const session = input.clientSessionId
    ? await prisma.trackingSession.findUnique({
        where: {
          organizationId_clientSessionId: {
            organizationId: input.organizationId,
            clientSessionId: input.clientSessionId,
          },
        },
      })
    : null;

  if (!session?.consentMarketing && !created) {
    return { eventId: event.eventId, deliveries: [] as const };
  }

  const claim = await claimTrackingDelivery({
    organizationId: input.organizationId,
    trackingEventId: event.id,
    channel: "meta_capi",
    eventName: "begin_checkout",
    eventId: event.eventId,
  });
  if (!claim.claimed || !claim.delivery) {
    return { eventId: event.eventId, deliveries: [] as const };
  }

  const result = await sendMetaCapiEvent({
    pixelId: config.metaPixelId || "",
    accessToken: token || "",
    eventName: "begin_checkout",
    eventId: event.eventId,
    valueCents: input.valueCents,
    currency: input.currency,
    contentIds: input.contentIds,
      userData: {
        fbp: session?.fbp,
        fbc: session?.fbc,
        userAgent: session?.userAgent,
        clientIp: normalizePublicClientIp(session?.clientIp),
      },
  });
  if (result.ok) {
    await markDeliverySent(claim.delivery.id, { stub: Boolean(result.stub), body: result.body });
  } else {
    await markDeliveryFailed(claim.delivery.id, result.error || "meta_capi_failed");
  }
  return { eventId: event.eventId, deliveries: [{ channel: "meta_capi", ok: result.ok }] };
}
