import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/commerce/fulfillment";
import { paymentAmountMatchesOrder } from "@/lib/commerce/payment-amount-guard";
import { shouldVoidTicketsOnRefund } from "@/lib/commerce/refund-rules";
import { releaseOrderHolds } from "@/lib/commerce/release-order-holds";
import { cancelTicketsAndRestoreInventory } from "@/lib/commerce/restore-ticket-inventory";
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
import { getPublicAppUrl } from "@/lib/embed/public-url";
import type { Prisma } from "@prisma/client";
import { formatDeDateTime } from "@/lib/datetime-de";

function appBaseUrl() {
  return getPublicAppUrl();
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
    ? formatDeDateTime(order.items[0].eventStartsAtSnapshot, {
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
  // Atomic claim via unique (provider, providerEventId). Concurrent duplicates lose the race.
  let claimed = false;
  try {
    await prisma.webhookInbox.create({
      data: {
        provider: "stripe",
        providerEventId: event.id,
        payload: event as object,
        status: "received",
      },
    });
    claimed = true;
  } catch (error) {
    const isUnique =
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (!isUnique) throw error;

    const existing = await prisma.webhookInbox.findUnique({
      where: {
        provider_providerEventId: { provider: "stripe", providerEventId: event.id },
      },
    });
    if (existing?.status === "processed") {
      return { ok: true as const, duplicate: true };
    }
    if (existing?.status === "received" || existing?.status === "processing") {
      // Another worker owns this event — treat as in-flight duplicate (Stripe will retry if it fails).
      return { ok: true as const, duplicate: true, inFlight: true };
    }
    // failed / ignored — allow reprocess by updating payload and continuing
    await prisma.webhookInbox.update({
      where: { id: existing!.id },
      data: {
        status: "received",
        payload: event as object,
        errorMessage: null,
        processedAt: null,
      },
    });
    claimed = true;
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

        const amountCheck = paymentAmountMatchesOrder({
          paymentAmountCents: pi.amount,
          paymentCurrency: pi.currency,
          customerTotalCents: order.customerTotalCents,
          grossCents: order.grossCents,
          orderCurrency: order.currency,
        });
        if (!amountCheck.ok) {
          console.error(
            "[stripe] KRITISCH: PaymentIntent-Betrag stimmt nicht mit Bestellung überein — keine Fulfillment",
            {
              orderId,
              orderNumber: order.orderNumber,
              paymentIntentId: pi.id,
              reason: amountCheck.reason,
              erwartetCents: amountCheck.expectedCents,
              tatsaechlichCents: amountCheck.actualCents,
              erwartetWaehrung: amountCheck.expectedCurrency,
              tatsaechlichWaehrung: amountCheck.actualCurrency,
            },
          );
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "needs_review",
              failedReasonCode: "PAYMENT_AMOUNT_MISMATCH",
              failedReasonMessage: `Stripe-Betrag weicht ab (${amountCheck.actualCents} ${amountCheck.actualCurrency} vs. erwartet ${amountCheck.expectedCents} ${amountCheck.expectedCurrency}). Bitte manuell prüfen — Tickets wurden nicht ausgestellt.`,
            },
          });
          await writeAudit({
            organizationId: order.organizationId,
            action: "payment.amount_mismatch_blocked",
            entityType: "order",
            entityId: orderId,
            after: {
              paymentIntentId: pi.id,
              reason: amountCheck.reason,
              expectedCents: amountCheck.expectedCents,
              actualCents: amountCheck.actualCents,
              expectedCurrency: amountCheck.expectedCurrency,
              actualCurrency: amountCheck.actualCurrency,
              fulfilled: false,
            },
            reason: "PaymentIntent amount/currency mismatch — fulfillment blocked",
          });
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
        // Promo/gift soft-fail lives inside fulfillPaidOrder: tickets are issued
        // even if redemption is exhausted; order is flagged needs_review for ops.
        await fulfillPaidOrder(orderId);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            ticketReleasedAt: new Date(),
            reservationStatus: "consumed",
          },
        });

        // Tageskasse Tap to Pay: fiscal stub after Stripe success (cash path signs inside createBoxOfficeSale).
        if (
          pi.metadata?.source === "box_office_tap" ||
          (order.channel === "box_office" && order.paymentMethod === "card_present")
        ) {
          try {
            const { signBoxOfficeSale } = await import("@/lib/fiscal/tse");
            const org = await prisma.organization.findUnique({
              where: { id: order.organizationId },
              include: { settings: true },
            });
            const payment = await prisma.payment.findFirst({
              where: { orderId, provider: "stripe" },
            });
            if (org && payment) {
              const existingFiscal = await prisma.fiscalTransaction.findFirst({
                where: { orderId, paymentId: payment.id },
              });
              if (!existingFiscal) {
                const fiscal = await signBoxOfficeSale({
                  organizationId: order.organizationId,
                  orderId,
                  paymentId: payment.id,
                  amountCents: payment.amountCents,
                  currency: payment.currency,
                  paymentMethod: "card_present",
                  tseMode: org.settings?.tseMode ?? "none",
                  tseProvider: org.settings?.tseProvider,
                  tseClientId: org.settings?.tseClientId,
                  tseTssId: org.settings?.tseTssId,
                });
                await prisma.fiscalTransaction.create({
                  data: {
                    organizationId: order.organizationId,
                    orderId,
                    paymentId: payment.id,
                    provider: fiscal.provider,
                    status: fiscal.status,
                    externalId: fiscal.externalId,
                    tssId: fiscal.tssId,
                    clientId: fiscal.clientId,
                    processType: fiscal.processType,
                    signatureValue: fiscal.signatureValue,
                    signatureCounter: fiscal.signatureCounter,
                    qrCodeData: fiscal.qrCodeData,
                    certificateSerial: fiscal.certificateSerial,
                    timeStart: fiscal.timeStart,
                    timeEnd: fiscal.timeEnd,
                    raw: (fiscal.raw ?? {}) as Prisma.InputJsonValue,
                    errorMessage: fiscal.errorMessage,
                  },
                });
              }
              await writeAudit({
                organizationId: order.organizationId,
                actorUserId: order.soldByUserId,
                action: "box_office.tap_sale_paid",
                entityType: "order",
                entityId: orderId,
                after: {
                  paymentIntentId: pi.id,
                  source: "box_office_tap",
                },
                reason: "Tageskasse Tap to Pay — Stripe PaymentIntent succeeded",
              });
            }
          } catch (fiscalError) {
            console.error("[stripe] box_office_tap fiscal failed", orderId, fiscalError);
          }
        }
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

        // Out-of-order: never downgrade a paid/fulfilled order back to processing.
        if (
          order.paymentStatus === "paid" ||
          order.paymentStatus === "refunded" ||
          order.paymentStatus === "disputed" ||
          order.fulfillmentLockedAt ||
          order.status === "paid" ||
          order.status === "fulfilled"
        ) {
          break;
        }

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

        // Early release is hard-gated inactive; tickets wait for payment_intent.succeeded.
        const rawReleaseMode = order.organization.settings?.sepaTicketReleaseMode;
        if (rawReleaseMode === "after_submission") {
          await writeAudit({
            organizationId: order.organizationId,
            action: "payment.sepa_early_release_skipped",
            entityType: "order",
            entityId: orderId,
            after: {
              note: "after_submission still stored but tickets wait for succeeded (gated)",
              normalized: normalizeSepaTicketReleaseMode(rawReleaseMode),
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
        const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });
        if (!existingOrder) break;
        // Out-of-order: do not void a settled payment on a late fail/cancel event.
        if (
          existingOrder.paymentStatus === "paid" ||
          existingOrder.paymentStatus === "refunded" ||
          existingOrder.paymentStatus === "disputed" ||
          existingOrder.fulfillmentLockedAt
        ) {
          await writeAudit({
            organizationId: existingOrder.organizationId,
            action: "payment.late_fail_ignored",
            entityType: "order",
            entityId: orderId,
            after: {
              eventType: event.type,
              paymentStatus: existingOrder.paymentStatus,
              paymentIntentId: pi.id,
            },
            reason: "Out-of-order fail/cancel after paid — ignored",
          });
          break;
        }
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
        let restoredQty = 0;
        if (full) {
          const preferredPoolChannel =
            order.channel === "box_office" ? "box_office" : "online";
          const restore = await prisma.$transaction(async (tx) => {
            const result = await cancelTicketsAndRestoreInventory(tx, {
              orderId: order.id,
              nextTicketStatus: "cancelled",
              preferredPoolChannel,
              revokeQr: true,
            });
            await tx.payment.updateMany({
              where: { orderId: order.id, provider: "stripe" },
              data: { status: "refunded" },
            });
            return result;
          });
          restoredQty = restore.restoredQty;
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
            inventoryRestoredQty: restoredQty,
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
          const preferredPoolChannel =
            order.channel === "box_office" ? "box_office" : "online";
          const restore = await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: "disputed",
                status: "disputed",
              },
            });
            return cancelTicketsAndRestoreInventory(tx, {
              orderId: order.id,
              nextTicketStatus: "cancelled",
              preferredPoolChannel,
              revokeQr: true,
            });
          });
          await writeAudit({
            organizationId: order.organizationId,
            action: "payment.dispute.inventory_restored",
            entityType: "order",
            entityId: order.id,
            after: {
              ticketIds: restore.ticketIds,
              inventoryRestoredQty: restore.restoredQty,
            },
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
    return { ok: true as const, duplicate: false, claimed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_failed";
    await markInbox(event.id, event, "failed", message);
    throw error;
  }
}
