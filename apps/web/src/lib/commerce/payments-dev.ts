import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { writeAudit } from "@/lib/audit";
import { getPaymentProvider } from "@/lib/payments";

/**
 * Mark a pending dev payment as paid and fulfill tickets.
 * Used by the authenticated test-checkout button (no client secret).
 */
export async function completeDevPaymentForOrder(orderId: string) {
  if (getPaymentProvider().key !== "dev") {
    throw new Error("NOT_DEV_PROVIDER");
  }

  const payment = await prisma.payment.findFirst({
    where: { orderId, provider: "dev" },
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  const providerEventId = `evt_complete_${orderId}_${payment.id}`;
  const existing = await prisma.webhookInbox.findUnique({
    where: {
      provider_providerEventId: {
        provider: "dev",
        providerEventId,
      },
    },
  });
  if (existing?.status === "processed") {
    return { duplicate: true, status: "processed" as const, orderId };
  }

  const inbox =
    existing ??
    (await prisma.webhookInbox.create({
      data: {
        provider: "dev",
        providerEventId,
        payload: { orderId, providerPaymentId: payment.providerPaymentId, source: "dev_complete" },
        status: "received",
      },
    }));

  if (payment.status !== "paid") {
    const order = payment.order;
    const customerTotal = order.customerTotalCents || order.grossCents;
    const actualFee =
      order.actualPaymentFeeCents ?? order.estimatedPaymentFeeCents ?? 0;
    const netPayout = Math.max(0, customerTotal - actualFee);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "paid",
        rawStatus: "paid",
        paidAt: new Date(),
        providerFeeCents: actualFee,
        netSettledCents: netPayout,
      },
    });
    await prisma.order.update({
      where: { id: payment.orderId },
      data: {
        status: "processing_payment",
        paymentStatus: "paid",
        actualPaymentFeeCents: actualFee,
        netPayoutCents: netPayout,
        paymentCompletedAt: new Date(),
        providerTransactionId: payment.providerPaymentId,
        paidAt: new Date(),
      },
    });
  }

  const fulfillment = await fulfillPaidOrder(payment.orderId);

  await prisma.webhookInbox.update({
    where: { id: inbox.id },
    data: {
      organizationId: payment.organizationId,
      status: "processed",
      processedAt: new Date(),
    },
  });

  await writeAudit({
    organizationId: payment.organizationId,
    action: "payment.dev.completed",
    entityType: "payment",
    entityId: payment.id,
    after: { provider: "dev", orderId, source: "dev_complete" },
  });

  return {
    duplicate: Boolean(existing),
    status: "processed" as const,
    orderId: payment.orderId,
    fulfillment,
  };
}

/**
 * Dev payment provider webhook — requires DEV_PAYMENT_WEBHOOK_SECRET.
 * Prefer `/api/v1/payments/dev/complete` for UI test checkout.
 */
export async function processDevPaymentWebhook(input: {
  providerEventId: string;
  providerPaymentId: string;
  secret: string;
}) {
  const expected = process.env.DEV_PAYMENT_WEBHOOK_SECRET?.trim();
  if (!expected || input.secret !== expected) {
    throw new Error("INVALID_SIGNATURE");
  }

  const payment = await prisma.payment.findFirst({
    where: {
      provider: "dev",
      providerPaymentId: input.providerPaymentId,
    },
    select: { orderId: true },
  });
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");
  return completeDevPaymentForOrder(payment.orderId);
}
