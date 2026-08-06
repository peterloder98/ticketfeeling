import { NextResponse } from "next/server";
import { requireBoxOfficeSeller } from "@/lib/commerce/box-office-auth";
import { prisma } from "@/lib/db";
import { cancelTerminalPaymentIntent } from "@/lib/payments/stripe-terminal";
import { releaseOrderHolds } from "@/lib/commerce/release-order-holds";
import { writeAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ orderId: string }> };

/** Poll Tageskasse sale status (Tap to Pay waiting UI). */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireBoxOfficeSeller();
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.error.code } },
      { status: auth.error.status },
    );
  }

  const { orderId } = await ctx.params;
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId: auth.organizationId,
      channel: "box_office",
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      customerTotalCents: true,
      stripePaymentIntentId: true,
      fulfillmentLockedAt: true,
      reservedUntil: true,
      tickets: { select: { id: true }, take: 1 },
    },
  });

  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const paid =
    order.paymentStatus === "paid" ||
    order.status === "paid" ||
    order.status === "fulfilled";
  const ready = paid && (Boolean(order.fulfillmentLockedAt) || order.tickets.length > 0);

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    amountCents: order.customerTotalCents,
    paymentIntentId: order.stripePaymentIntentId,
    reservedUntil: order.reservedUntil?.toISOString() ?? null,
    paid,
    ready,
    detailPath: `/kasse/beleg/${order.id}`,
  });
}

/** Cancel a pending Tap to Pay sale (releases holds). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireBoxOfficeSeller();
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.error.code } },
      { status: auth.error.status },
    );
  }

  const { orderId } = await ctx.params;
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId: auth.organizationId,
      channel: "box_office",
      paymentMethod: "card_present",
    },
  });

  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (order.paymentStatus === "paid" || order.status === "fulfilled") {
    return NextResponse.json({ error: { code: "ALREADY_PAID" } }, { status: 409 });
  }

  if (order.stripePaymentIntentId) {
    try {
      await cancelTerminalPaymentIntent(order.stripePaymentIntentId);
    } catch {
      // PI may already be canceled / succeeded — continue local cancel
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "canceled",
      status: "cancelled",
      paymentFailedAt: new Date(),
      failedReasonCode: "staff_cancel",
    },
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id, provider: "stripe" },
    data: { status: "canceled" },
  });
  await releaseOrderHolds(order.id);

  await writeAudit({
    organizationId: auth.organizationId,
    actorUserId: auth.userId,
    action: "box_office.tap_sale_canceled",
    entityType: "order",
    entityId: order.id,
    reason: "Mitarbeiter hat Tap to Pay abgebrochen",
  });

  return NextResponse.json({ ok: true, orderId: order.id });
}
