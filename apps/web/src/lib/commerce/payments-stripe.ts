import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { shouldVoidTicketsOnRefund } from "@/lib/commerce/refund-rules";
import { releaseOrderHolds } from "@/lib/commerce/release-order-holds";
import { normalizeSepaTicketReleaseMode } from "@/lib/commerce/sepa-availability";
import { writeAudit } from "@/lib/audit";
import { getStripe } from "@/lib/payments/stripe-client";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import {
  buildSepaDisputeMail,
  buildSepaFailedMail,
  buildSepaProcessingMail,
} from "@/lib/email/ticket-mail";
import { formatEuroFromCents } from "@/lib/money";
import { invalidateWalletPassesForOrder } from "@/lib/wallet/invalidate";

function appBaseUrl() {
  return (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

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

async function extractSepaDetails(pi: Stripe.PaymentIntent) {
  const pmId =
    typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
  if (!pmId) {
    return {
      stripePaymentMethodId: null as string | null,
      stripeMandateId: null as string | null,
      ibanLast4: null as string | null,
      accountHolderName: null as string | null,
      sepaMandateReference: null as string | null,
    };
  }
  try {
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(pmId);
    const sepa = pm.sepa_debit;
    // Stripe types omit mandate on GeneratedFrom in some SDK versions
    const generatedFrom = sepa?.generated_from as { mandate?: string | { id?: string } } | null;
    const mandateRaw = generatedFrom?.mandate;
    const mandateId =
      typeof mandateRaw === "string"
        ? mandateRaw
        : typeof mandateRaw === "object" && mandateRaw?.id
          ? mandateRaw.id
          : null;
    return {
      stripePaymentMethodId: pm.id,
      stripeMandateId: mandateId,
      ibanLast4: sepa?.last4 ?? null,
      accountHolderName: pm.billing_details?.name ?? null,
      sepaMandateReference: sepa?.fingerprint ?? null,
    };
  } catch {
    return {
      stripePaymentMethodId: pmId,
      stripeMandateId: null,
      ibanLast4: null,
      accountHolderName: null,
      sepaMandateReference: null,
    };
  }
}

async function sendSepaProcessingEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: true,
      organization: { include: { settings: true } },
    },
  });
  if (!order) return;
  const releaseMode = normalizeSepaTicketReleaseMode(
    order.organization.settings?.sepaTicketReleaseMode,
  );
  const eventName = order.items[0]?.eventNameSnapshot ?? "dein Event";
  const whenLabel = order.items[0]?.eventStartsAtSnapshot
    ? order.items[0].eventStartsAtSnapshot.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;
  const mail = buildSepaProcessingMail({
    firstName: order.customer.firstName,
    orderNumber: order.orderNumber,
    orderId: order.id,
    eventName,
    whenLabel,
    totalLabel: formatEuroFromCents(order.customerTotalCents || order.grossCents),
    ticketsAfterConfirm: releaseMode === "after_confirmed",
  });
  await enqueueTransactionalEmail({
    organizationId: order.organizationId,
    to: order.customer.email,
    template: "sepa_payment_processing",
    subject: mail.subject,
    payload: { orderId: order.id },
    text: mail.text,
    html: mail.html,
  });
}

async function sendSepaFailedEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: true },
  });
  if (!order) return;
  const mail = buildSepaFailedMail({
    firstName: order.customer.firstName,
    orderNumber: order.orderNumber,
    orderId: order.id,
    eventName: order.items[0]?.eventNameSnapshot ?? "dein Event",
    reservedUntilLabel: order.reservedUntil
      ? order.reservedUntil.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
      : null,
    payUrl: `${appBaseUrl()}/checkout/pay/${order.id}`,
  });
  await enqueueTransactionalEmail({
    organizationId: order.organizationId,
    to: order.customer.email,
    template: "sepa_payment_failed",
    subject: mail.subject,
    payload: { orderId: order.id },
    text: mail.text,
    html: mail.html,
  });
}

async function sendSepaDisputeEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: true },
  });
  if (!order) return;
  const mail = buildSepaDisputeMail({
    firstName: order.customer.firstName,
    orderNumber: order.orderNumber,
    orderId: order.id,
    eventName: order.items[0]?.eventNameSnapshot ?? "dein Event",
    payUrl: `${appBaseUrl()}/checkout/pay/${order.id}`,
  });
  await enqueueTransactionalEmail({
    organizationId: order.organizationId,
    to: order.customer.email,
    template: "sepa_payment_dispute",
    subject: mail.subject,
    payload: { orderId: order.id },
    text: mail.text,
    html: mail.html,
  });
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
      case "payment_intent.created": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        await prisma.order.updateMany({
          where: { id: orderId, paymentCreatedAt: null },
          data: {
            paymentCreatedAt: new Date(),
            stripePaymentIntentId: pi.id,
            paymentStatus: "awaiting_payment_method",
          },
        });
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) break;

        // Idempotent: already fulfilled
        if (order.paymentStatus === "paid" && order.fulfillmentLockedAt) {
          break;
        }

        const isSepa = pi.payment_method_types?.includes("sepa_debit");
        const sepaDetails = isSepa ? await extractSepaDetails(pi) : null;

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
              paymentSucceededAt: new Date(),
              stripePaymentIntentId: pi.id,
              providerTransactionId: pi.id,
              ...(sepaDetails
                ? {
                    stripePaymentMethodId: sepaDetails.stripePaymentMethodId,
                    stripeMandateId: sepaDetails.stripeMandateId,
                    ibanLast4: sepaDetails.ibanLast4,
                    accountHolderName: sepaDetails.accountHolderName,
                    sepaMandateReference: sepaDetails.sepaMandateReference,
                  }
                : {}),
            },
          }),
        ]);

        const chargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id ?? null;
        await applyBalanceFees(orderId, chargeId);
        await fulfillPaidOrder(orderId);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            ticketReleasedAt: new Date(),
            reservationStatus: "consumed",
          },
        });
        break;
      }
      case "payment_intent.processing": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { organization: { include: { settings: true } } },
        });
        if (!order) break;

        // SEPA Mandate submitted — NOT paid yet. Never issue tickets here (default).
        const sepaDetails = await extractSepaDetails(pi);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "processing",
            status: "pending_payment",
            paymentProcessingAt: new Date(),
            stripePaymentIntentId: pi.id,
            stripePaymentMethodId: sepaDetails.stripePaymentMethodId,
            stripeMandateId: sepaDetails.stripeMandateId,
            ibanLast4: sepaDetails.ibanLast4,
            accountHolderName: sepaDetails.accountHolderName,
            sepaMandateReference: sepaDetails.sepaMandateReference,
          },
        });
        await prisma.payment.updateMany({
          where: { orderId, provider: "stripe" },
          data: { status: "processing", rawStatus: pi.status },
        });

        await sendSepaProcessingEmail(orderId);

        const releaseMode = normalizeSepaTicketReleaseMode(
          order.organization.settings?.sepaTicketReleaseMode,
        );
        if (releaseMode === "after_submission") {
          // Optional admin setting — still mark payment as processing; fulfill only if
          // product ever enables early release. Hard-gated off by default in admin UI.
          await writeAudit({
            organizationId: order.organizationId,
            action: "payment.sepa_early_release_skipped",
            entityType: "order",
            entityId: orderId,
            after: {
              note: "after_submission configured but tickets still wait for succeeded for safety",
            },
          });
        }
        break;
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) break;
        const failed = event.type === "payment_intent.payment_failed";
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: failed ? "failed" : "canceled",
            paymentFailedAt: new Date(),
            failedReasonCode: pi.last_payment_error?.code ?? event.type,
            failedReasonMessage: pi.last_payment_error?.message ?? null,
          },
        });
        await prisma.payment.updateMany({
          where: { orderId, provider: "stripe" },
          data: {
            status: failed ? "failed" : "canceled",
            rawStatus: pi.status,
          },
        });
        await prisma.ticket.updateMany({
          where: { orderId, status: "active" },
          data: { status: "cancelled" },
        });
        await releaseOrderHolds(orderId);
        await invalidateWalletPassesForOrder(orderId).catch((error) => {
          console.error("[wallet] invalidate after SEPA fail/cancel", orderId, error);
        });
        if (failed) await sendSepaFailedEmail(orderId);
        break;
      }
      case "charge.refunded": {
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
          await invalidateWalletPassesForOrder(order.id).catch((error) => {
            console.error("[wallet] invalidate after refund", order.id, error);
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
      case "charge.dispute.updated":
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
          action: `payment.dispute.${event.type.split(".").pop()}`,
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
          await invalidateWalletPassesForOrder(order.id).catch((error) => {
            console.error("[wallet] invalidate after dispute", order.id, error);
          });
          await sendSepaDisputeEmail(order.id);
        }
        break;
      }
      case "payout.created":
      case "payout.updated":
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled":
      case "balance.available":
      case "charge.updated":
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const { processQueuedPayoutWebhook } = await import("@/lib/stripe-payout/sync");
        await processQueuedPayoutWebhook(event);
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
