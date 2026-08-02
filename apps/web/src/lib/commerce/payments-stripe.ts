import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { shouldVoidTicketsOnRefund } from "@/lib/commerce/refund-rules";
import { writeAudit } from "@/lib/audit";
import { getStripe } from "@/lib/payments/stripe-client";

async function markInbox(providerEventId: string, payload: unknown, status: string, error?: string) {
  await prisma.webhookInbox.upsert({
    where: {
      provider_providerEventId: { provider: "stripe", providerEventId },
    },
    create: {
      provider: "stripe",
      providerEventId,
      payload: payload as object,
      status,
      processedAt: status === "processed" ? new Date() : null,
      errorMessage: error ?? null,
    },
    update: {
      status,
      processedAt: status === "processed" ? new Date() : null,
      errorMessage: error ?? null,
      payload: payload as object,
    },
  });
}

async function applyBalanceFees(orderId: string, chargeId: string | null) {
  if (!chargeId) return;
  try {
    const stripe = getStripe();
    const charge = await stripe.charges.retrieve(chargeId, {
      expand: ["balance_transaction"],
    });
    const bt = charge.balance_transaction;
    if (!bt || typeof bt === "string") return;
    const fee = typeof bt.fee === "number" ? bt.fee : null;
    const net = typeof bt.net === "number" ? bt.net : null;
    await prisma.order.update({
      where: { id: orderId },
      data: {
        stripeChargeId: chargeId,
        stripeBalanceTransactionId: bt.id,
        stripeFeeActualCents: fee,
        actualPaymentFeeCents: fee,
        stripeNetPayoutCents: net,
        netPayoutCents: net,
      },
    });
    await prisma.payment.updateMany({
      where: { orderId, provider: "stripe" },
      data: {
        providerFeeCents: fee ?? undefined,
        netSettledCents: net ?? undefined,
      },
    });
  } catch {
    // Fee enrichment is best-effort; payment success still stands
  }
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  const existing = await prisma.webhookInbox.findUnique({
    where: {
      provider_providerEventId: { provider: "stripe", providerEventId: event.id },
    },
  });
  if (existing?.status === "processed") {
    return { ok: true as const, duplicate: true };
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) break;

        const isSepa = pi.payment_method_types?.includes("sepa_debit");
        // SEPA can succeed asynchronously; treat as paid when PI succeeded
        await prisma.$transaction([
          prisma.payment.updateMany({
            where: { orderId, provider: "stripe" },
            data: {
              status: "paid",
              providerPaymentId: pi.id,
              paidAt: new Date(),
              rawStatus: pi.status,
              method: isSepa ? "sepa_debit" : order.paymentMethod,
            },
          }),
          prisma.order.update({
            where: { id: orderId },
            data: {
              status: "paid",
              paymentStatus: "paid",
              paidAt: new Date(),
              paymentCompletedAt: new Date(),
              stripePaymentIntentId: pi.id,
              providerTransactionId: pi.id,
            },
          }),
        ]);

        const chargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id ?? null;
        await applyBalanceFees(orderId, chargeId);
        await fulfillPaidOrder(orderId);
        break;
      }
      case "payment_intent.processing": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        // SEPA Mandate submitted — NOT paid yet. Never issue tickets here.
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: "processing", status: "pending_payment" },
        });
        await prisma.payment.updateMany({
          where: { orderId, provider: "stripe" },
          data: { status: "processing", rawStatus: pi.status },
        });
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "failed",
            paymentFailedAt: new Date(),
          },
        });
        await prisma.payment.updateMany({
          where: { orderId, provider: "stripe" },
          data: { status: "failed", rawStatus: pi.status },
        });
        // Safety net: there must never be active tickets without confirmed payment.
        await prisma.ticket.updateMany({
          where: { orderId, status: "active" },
          data: { status: "cancelled" },
        });
        break;
      }
      case "charge.refunded": {
        // Product policy: no customer online refunds. This only reacts if money was
        // returned in Stripe (e.g. full event cancellation processed by support).
        // Valid tickets must not remain after a full charge refund.
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!piId) break;
        const order = await prisma.order.findFirst({
          where: { stripePaymentIntentId: piId },
        });
        if (!order) break;
        const refunded = charge.amount_refunded ?? 0;
        const full = shouldVoidTicketsOnRefund({
          refundedAmountCents: refunded,
          customerTotalCents: order.customerTotalCents,
          grossCents: order.grossCents,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: {
            refundedAmountCents: refunded,
            paymentStatus: full ? "refunded" : order.paymentStatus,
            status: full ? "refunded" : order.status,
          },
        });
        if (full) {
          await prisma.ticket.updateMany({
            where: { orderId: order.id, status: "active" },
            data: { status: "cancelled" },
          });
          await prisma.payment.updateMany({
            where: { orderId: order.id, provider: "stripe" },
            data: { status: "refunded" },
          });
        }
        await writeAudit({
          organizationId: order.organizationId,
          action: "payment.stripe_charge_refunded",
          entityType: "order",
          entityId: order.id,
          after: {
            refundedAmountCents: refunded,
            fullRefund: full,
            ticketsVoided: full,
            chargeId: charge.id,
            note: "No customer self-serve refund; Stripe-side / event-cancel only",
          },
        });
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const piId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        if (!piId) break;
        const order = await prisma.order.findFirst({
          where: { stripePaymentIntentId: piId },
        });
        if (!order) break;
        await writeAudit({
          organizationId: order.organizationId,
          action: `payment.dispute.${event.type === "charge.dispute.created" ? "created" : "closed"}`,
          entityType: "order",
          entityId: order.id,
          after: {
            disputeId: dispute.id,
            status: dispute.status,
            amount: dispute.amount,
            reason: dispute.reason,
          },
        });
        if (event.type === "charge.dispute.created") {
          // Chargeback / SEPA-Rückgabe: Geld kann später weg sein — Tickets sofort ungültig.
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: "disputed",
              status: "disputed",
            },
          });
          await prisma.ticket.updateMany({
            where: { orderId: order.id, status: "active" },
            data: { status: "cancelled" },
          });
        }
        break;
      }
      default:
        break;
    }

    await markInbox(event.id, event, "processed");
    return { ok: true as const, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_failed";
    await markInbox(event.id, event, "failed", message);
    throw error;
  }
}
