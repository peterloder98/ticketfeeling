import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { enqueueJob, kickJob, processPendingJobs } from "@/lib/jobs/queue";
import { enqueuePostFulfillJobs, ensureJobHandlersRegistered } from "@/lib/jobs/handlers";
import { getStripe } from "@/lib/payments/stripe-client";

export type ReconcileSummary = {
  paidMissingTickets: number;
  missingTicketEmail: number;
  failedWebhooksRetried: number;
  jobsProcessed: ReturnType<typeof processPendingJobs> extends Promise<infer R> ? R : never;
  healed: number;
  needsAttention: number;
  errors: string[];
};

/**
 * Clear-case reconciliation only:
 * - paid order without tickets → enqueue heal
 * - paid order with tickets but no buyer email → enqueue email
 * - failed webhook_inbox → re-process when payload is payment_intent.succeeded
 * - drain pending background jobs
 */
export async function runCommerceReconciliation(options?: {
  limit?: number;
}): Promise<ReconcileSummary> {
  ensureJobHandlersRegistered();
  const limit = options?.limit ?? 40;
  const errors: string[] = [];
  let healed = 0;
  let needsAttention = 0;
  let paidMissingTickets = 0;
  let missingTicketEmail = 0;
  let failedWebhooksRetried = 0;

  // 1) Paid orders without tickets
  const unpaidTickets = await prisma.order.findMany({
    where: {
      OR: [{ paymentStatus: "paid" }, { status: { in: ["paid", "fulfilled"] } }],
      voidedAt: null,
      tickets: { none: {} },
      paymentStatus: { not: "needs_review" },
    },
    take: limit,
    select: {
      id: true,
      organizationId: true,
      orderNumber: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      payments: { select: { status: true, provider: true } },
    },
  });

  for (const order of unpaidTickets) {
    paidMissingTickets += 1;
    const hasPaidRow = order.payments.some((p) => p.status === "paid");
    if (!hasPaidRow && !order.stripePaymentIntentId) {
      needsAttention += 1;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "needs_review",
          failedReasonCode: "RECONCILE_AMBIGUOUS_PAID",
          failedReasonMessage:
            "Als bezahlt markiert, aber keine Payment-Zeile und kein Stripe PI — manuell prüfen.",
        },
      });
      await writeAudit({
        organizationId: order.organizationId,
        action: "reconcile.needs_attention",
        entityType: "order",
        entityId: order.id,
        after: { reason: "paid_without_payment_or_pi" },
      });
      continue;
    }

    // If we have a PI but no local paid row, verify with Stripe before healing
    if (!hasPaidRow && order.stripePaymentIntentId) {
      try {
        const pi = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
        if (pi.status !== "succeeded") {
          needsAttention += 1;
          await writeAudit({
            organizationId: order.organizationId,
            action: "reconcile.stripe_not_succeeded",
            entityType: "order",
            entityId: order.id,
            after: { piStatus: pi.status, paymentIntentId: pi.id },
          });
          continue;
        }
        // Align local payment row
        await prisma.$transaction([
          prisma.payment.updateMany({
            where: { orderId: order.id, provider: "stripe" },
            data: {
              status: "paid",
              providerPaymentId: pi.id,
              paidAt: new Date(),
              rawStatus: pi.status,
            },
          }),
          prisma.order.update({
            where: { id: order.id },
            data: {
              status: "paid",
              paymentStatus: "paid",
              paidAt: order.paymentStatus === "paid" ? undefined : new Date(),
              paymentSucceededAt: new Date(),
            },
          }),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`stripe_verify:${order.orderNumber}:${message}`);
        continue;
      }
    }

    const { id } = await enqueueJob({
      type: "reconcile.heal_order",
      organizationId: order.organizationId,
      dedupeKey: `reconcile.heal_order:${order.id}`,
      payload: { orderId: order.id, reason: "paid_missing_tickets" },
    });
    kickJob(id);
    healed += 1;
  }

  // 2) Paid with tickets, buyer mail never sent
  const missingMail = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      ticketSentAt: null,
      channel: { not: "box_office" },
      voidedAt: null,
      tickets: { some: {} },
    },
    take: limit,
    select: { id: true, organizationId: true },
  });
  for (const order of missingMail) {
    missingTicketEmail += 1;
    await enqueuePostFulfillJobs(order.id, order.organizationId);
    healed += 1;
  }

  // 3) Failed commerce webhooks — re-queue processing via heal if PI succeeded
  const failedInbox = await prisma.webhookInbox.findMany({
    where: { provider: "stripe", status: "failed" },
    orderBy: { createdAt: "desc" },
    take: Math.min(20, limit),
  });
  for (const row of failedInbox) {
    try {
      const payload = row.payload as {
        type?: string;
        data?: { object?: { metadata?: { orderId?: string }; id?: string; status?: string } };
      };
      const type = payload?.type;
      const orderId = payload?.data?.object?.metadata?.orderId;
      if (type === "payment_intent.succeeded" && orderId) {
        const { id } = await enqueueJob({
          type: "reconcile.heal_order",
          organizationId: row.organizationId,
          dedupeKey: `reconcile.heal_order:${orderId}`,
          payload: { orderId, reason: "failed_webhook", webhookInboxId: row.id },
        });
        kickJob(id);
        await prisma.webhookInbox.update({
          where: { id: row.id },
          data: { status: "received", errorMessage: "requeued_by_reconcile" },
        });
        failedWebhooksRetried += 1;
        healed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`webhook_retry:${row.id}:${message}`);
    }
  }

  // 4) Drain job queue
  const jobsProcessed = await processPendingJobs({ limit });

  await writeAudit({
    organizationId: null,
    action: "reconcile.commerce_run",
    entityType: "system",
    entityId: "commerce_reconcile",
    after: {
      paidMissingTickets,
      missingTicketEmail,
      failedWebhooksRetried,
      jobsProcessed,
      healed,
      needsAttention,
      errorCount: errors.length,
    },
  });

  return {
    paidMissingTickets,
    missingTicketEmail,
    failedWebhooksRetried,
    jobsProcessed,
    healed,
    needsAttention,
    errors,
  };
}
