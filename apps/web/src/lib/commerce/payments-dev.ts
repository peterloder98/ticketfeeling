import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { writeAudit } from "@/lib/audit";

/**
 * Dev payment provider — NOT for production.
 * Simulates a signed, idempotent webhook confirmation.
 * Replace with Stripe Direct webhooks before go-live.
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

  const existing = await prisma.webhookInbox.findUnique({
    where: {
      provider_providerEventId: {
        provider: "dev",
        providerEventId: input.providerEventId,
      },
    },
  });
  if (existing?.status === "processed") {
    return { duplicate: true, status: "processed" as const };
  }

  const inbox = existing
    ? existing
    : await prisma.webhookInbox.create({
        data: {
          provider: "dev",
          providerEventId: input.providerEventId,
          payload: input,
          status: "received",
        },
      });

  const payment = await prisma.payment.findFirst({
    where: {
      provider: "dev",
      providerPaymentId: input.providerPaymentId,
    },
    include: { order: true },
  });

  if (!payment) {
    await prisma.webhookInbox.update({
      where: { id: inbox.id },
      data: { status: "failed", errorMessage: "payment_not_found" },
    });
    throw new Error("PAYMENT_NOT_FOUND");
  }

  if (payment.status !== "paid") {
    const order = payment.order;
    const customerTotal = order.customerTotalCents || order.grossCents;
    // Dev simulates provider fee = estimate (live webhooks overwrite with actual)
    const actualFee =
      order.actualPaymentFeeCents ??
      order.estimatedPaymentFeeCents ??
      0;
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

  // Tickets only after confirmed paid — never treat raw "processing" as paid for SEPA live
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
    action: "payment.webhook.processed",
    entityType: "payment",
    entityId: payment.id,
    after: {
      provider: "dev",
      providerEventId: input.providerEventId,
      duplicate: Boolean(existing),
    },
  });

  return {
    duplicate: Boolean(existing),
    status: "processed" as const,
    orderId: payment.orderId,
    fulfillment,
  };
}
