import { prisma } from "@/lib/db";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { normalizePublicClientIp } from "@/lib/security/client-ip";
import { resolveTrackingConfig } from "@/lib/tracking/config";
import { mapToMeta, type TfTrackingEventName } from "@/lib/tracking/events";
import {
  resolveMetaCapiAccessToken,
  sendMetaCapiEvent,
} from "@/lib/tracking/meta-capi";
import {
  claimTrackingDelivery,
  markDeliveryFailed,
  markDeliverySent,
} from "@/lib/tracking/service";

export type MetaFunnelDispatchInput = {
  organizationId: string;
  trackingEventId: string;
  eventId: string;
  name: TfTrackingEventName;
  clientSessionId?: string | null;
  eventSlug?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  contentIds?: string[];
  contentName?: string | null;
  numItems?: number | null;
  eventSourceUrl?: string | null;
  consentMarketing: boolean;
  email?: string | null;
  externalId?: string | null;
  transactionId?: string | null;
};

/**
 * Server Meta CAPI for funnel stages (ViewContent → Purchase).
 */
export async function dispatchMetaCapiFunnelEvent(
  input: MetaFunnelDispatchInput,
): Promise<{ status: string; stub?: boolean; skipped?: boolean }> {
  const mapped = mapToMeta(input.name);
  if (!mapped) return { status: "unmapped", skipped: true };
  if (!input.consentMarketing && input.name !== "purchase") {
    return { status: "no_consent", skipped: true };
  }

  const claim = await claimTrackingDelivery({
    organizationId: input.organizationId,
    trackingEventId: input.trackingEventId,
    channel: "meta_capi",
    eventName: input.name,
    eventId: input.eventId,
    transactionId: input.transactionId,
  });

  if (!claim.claimed || !claim.delivery) {
    return { status: claim.delivery?.status ?? "skipped", skipped: true };
  }

  const org = await prisma.organizationSettings.findUnique({
    where: { organizationId: input.organizationId },
  });
  const config = resolveTrackingConfig(org);
  const token = resolveMetaCapiAccessToken(org?.trackingMetaCapiTokenEnc);
  const pixelId = config.metaPixelId || process.env.META_PIXEL_ID?.trim() || "";

  const session = input.clientSessionId
    ? await prisma.trackingSession.findUnique({
        where: {
          organizationId_clientSessionId: {
            organizationId: input.organizationId,
            clientSessionId: input.clientSessionId,
          },
        },
      })
    : await prisma.trackingSession.findFirst({
        where: { organizationId: input.organizationId },
        orderBy: { lastSeenAt: "desc" },
      });

  const sourceUrl =
    input.eventSourceUrl ||
    (input.eventSlug
      ? `${getPublicAppUrl()}/event/${encodeURIComponent(input.eventSlug)}`
      : session?.parentUrl || getPublicAppUrl());

  const result = await sendMetaCapiEvent({
    pixelId,
    accessToken: token || "",
    eventName: input.name,
    eventId: input.eventId,
    eventSourceUrl: sourceUrl,
    actionSource: "website",
    valueCents: input.valueCents,
    currency: input.currency || "EUR",
    contentIds: input.contentIds,
    contentName: input.contentName,
    numItems: input.numItems,
    userData: {
      email: input.consentMarketing ? input.email : null,
      externalId: input.consentMarketing ? input.externalId : null,
      fbp: session?.fbp,
      fbc: session?.fbc,
      userAgent: session?.userAgent,
      clientIp: normalizePublicClientIp(session?.clientIp),
    },
    testEventCode: process.env.META_TEST_EVENT_CODE?.trim() || null,
  });

  if (result.ok) {
    await markDeliverySent(claim.delivery.id, {
      stub: Boolean(result.stub),
      metaEvent: mapped.name,
      body: result.body,
    });
    return { status: "sent", stub: Boolean(result.stub) };
  }

  await markDeliveryFailed(claim.delivery.id, result.error || "meta_capi_failed");
  return { status: "failed" };
}
