import { NextResponse } from "next/server";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { purchaseEventIdForOrder } from "@/lib/tracking/events";
import { resolveTrackingConfig } from "@/lib/tracking/config";
import { prisma } from "@/lib/db";
import { verifyOrderAccessToken } from "@/lib/commerce/order-access";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Thank-you page: return purchase event_id + ecommerce payload for optional browser mirror.
 * Does NOT fire a new server purchase — webhook/fulfill already did.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { userId: true, emailNormalized: true } },
      items: {
        select: {
          eventId: true,
          eventNameSnapshot: true,
          productNameSnapshot: true,
          quantity: true,
          unitPaidGrossCents: true,
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
          settings: true,
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const isOwner =
    Boolean(session?.user) &&
    (order.customer.userId === session!.user!.id ||
      order.customer.emailNormalized === session!.user!.email?.toLowerCase());
  const hasToken = verifyOrderAccessToken(order.id, token);
  if (!isOwner && !hasToken) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const paid =
    order.paymentStatus === "paid" ||
    order.status === "paid" ||
    order.status === "fulfilled";
  if (!paid) {
    return NextResponse.json({ error: "not_paid" }, { status: 409 });
  }

  const org = await getDefaultOrganization();
  const config = resolveTrackingConfig(
    order.organization.settings,
    order.items[0]?.event ?? null,
  );

  const eventId = purchaseEventIdForOrder(order.id);
  const existing = await prisma.trackingEvent.findUnique({
    where: { eventId },
    include: {
      deliveries: {
        select: { channel: true, status: true, sentAt: true },
      },
    },
  });

  return NextResponse.json({
    eventId,
    transactionId: order.orderNumber,
    value: (order.customerTotalCents || order.grossCents) / 100,
    currency: order.currency || "EUR",
    items: order.items.map((i) => ({
      item_id: i.eventId,
      item_name: i.eventNameSnapshot || i.productNameSnapshot,
      price: i.unitPaidGrossCents / 100,
      quantity: i.quantity,
    })),
    tracking: {
      ga4MeasurementId: config.ga4MeasurementId,
      metaPixelId: config.metaPixelId,
      enabled: config.enabled || Boolean(org?.settings?.trackingEnabled),
    },
    serverDeliveries: existing?.deliveries ?? [],
  });
}
