import type Stripe from "stripe";
import { getPrisma } from "@/lib/db";
import { getStripe } from "@/lib/payments/stripe-client";
import { setPayoutStatus, writePayoutAudit } from "@/lib/stripe-payout/audit";
import { classifyBalanceTransaction } from "@/lib/stripe-payout/classify";
import { mapBalanceTransactionToOrder } from "@/lib/stripe-payout/map-order";
import { reconcilePayoutAmount } from "@/lib/stripe-payout/reconcile";
import { stripeEnvironment, type PayoutReconciliationStatus } from "@/lib/stripe-payout/types";

const MAX_BT_PAGES = 200;

function unixToDate(sec: number | null | undefined): Date | null {
  if (sec == null) return null;
  return new Date(sec * 1000);
}

function destinationLast4(payout: Stripe.Payout): string | null {
  const dest = payout.destination;
  if (!dest || typeof dest === "string") return null;
  if ("last4" in dest && typeof dest.last4 === "string") return dest.last4;
  return null;
}

export async function upsertStripePayoutFromObject(payout: Stripe.Payout) {
  const prisma = getPrisma();
  const env = stripeEnvironment();
  const automatic = payout.automatic !== false;
  const data = {
    stripePayoutId: payout.id,
    stripeAccountId: null as string | null,
    environment: env,
    amountCents: payout.amount,
    currency: payout.currency,
    status: payout.status,
    method: payout.method ?? null,
    type: payout.type ?? null,
    automatic,
    arrivalDate: unixToDate(payout.arrival_date),
    createdAtStripe: unixToDate(payout.created),
    failureCode: payout.failure_code ?? null,
    failureMessage: payout.failure_message ?? null,
    destinationLast4: destinationLast4(payout),
    lastSyncedAt: new Date(),
  };

  const existing = await prisma.stripePayout.findUnique({
    where: { stripePayoutId: payout.id },
  });

  const row = existing
    ? await prisma.stripePayout.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.stripePayout.create({
        data: {
          ...data,
          transactionReconciliationStatus: automatic
            ? payout.status === "failed"
              ? "payout_failed"
              : "announced"
            : "unsupported_manual_payout",
        },
      });

  if (!automatic && row.transactionReconciliationStatus !== "unsupported_manual_payout") {
    await setPayoutStatus(row.id, "unsupported_manual_payout", {
      lastImportError: "Manuelle Auszahlung – automatische Transaktionszuordnung nicht vollständig unterstützt",
    });
  }

  if (payout.status === "failed" || payout.status === "canceled") {
    await setPayoutStatus(row.id, "payout_failed");
  }

  await writePayoutAudit({
    localPayoutId: row.id,
    organizationId: row.organizationId,
    action: existing ? "payout_updated" : "payout_imported",
    newValue: { stripePayoutId: payout.id, status: payout.status, amount: payout.amount },
  });

  return row;
}

async function listAllBalanceTransactionsForPayout(payoutId: string): Promise<Stripe.BalanceTransaction[]> {
  const stripe = getStripe();
  const all: Stripe.BalanceTransaction[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_BT_PAGES; page++) {
    const res = await stripe.balanceTransactions.list({
      payout: payoutId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ["data.source"],
    });
    all.push(...res.data);
    if (!res.has_more) break;
    const last = res.data[res.data.length - 1];
    if (!last) break;
    startingAfter = last.id;
  }
  return all;
}

async function resolveSourceIds(bt: Stripe.BalanceTransaction): Promise<{
  stripeSourceId: string | null;
  stripeSourceType: string | null;
  stripeChargeId: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  stripeDisputeId: string | null;
  metadataOrderId: string | null;
  metadataInvoiceNumber: string | null;
}> {
  const source = bt.source;
  let stripeSourceId: string | null = null;
  let stripeSourceType: string | null = null;
  let stripeChargeId: string | null = null;
  let stripePaymentIntentId: string | null = null;
  let stripeRefundId: string | null = null;
  let stripeDisputeId: string | null = null;
  let metadataOrderId: string | null = null;
  let metadataInvoiceNumber: string | null = null;

  if (!source) {
    return {
      stripeSourceId,
      stripeSourceType,
      stripeChargeId,
      stripePaymentIntentId,
      stripeRefundId,
      stripeDisputeId,
      metadataOrderId,
      metadataInvoiceNumber,
    };
  }

  if (typeof source === "string") {
    stripeSourceId = source;
    return {
      stripeSourceId,
      stripeSourceType,
      stripeChargeId,
      stripePaymentIntentId,
      stripeRefundId,
      stripeDisputeId,
      metadataOrderId,
      metadataInvoiceNumber,
    };
  }

  stripeSourceId = source.id;
  stripeSourceType = source.object;

  if (source.object === "charge") {
    const charge = source as Stripe.Charge;
    stripeChargeId = charge.id;
    stripePaymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    metadataOrderId =
      charge.metadata?.order_id ?? charge.metadata?.orderId ?? null;
    metadataInvoiceNumber =
      charge.metadata?.invoice_number ?? charge.metadata?.invoiceNumber ?? null;
  } else if (source.object === "refund") {
    const refund = source as Stripe.Refund;
    stripeRefundId = refund.id;
    stripeChargeId =
      typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null;
    stripePaymentIntentId =
      typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : refund.payment_intent?.id ?? null;
  } else if (source.object === "dispute") {
    const dispute = source as Stripe.Dispute;
    stripeDisputeId = dispute.id;
    stripeChargeId =
      typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null;
    stripePaymentIntentId =
      typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent?.id ?? null;
  }

  return {
    stripeSourceId,
    stripeSourceType,
    stripeChargeId,
    stripePaymentIntentId,
    stripeRefundId,
    stripeDisputeId,
    metadataOrderId,
    metadataInvoiceNumber,
  };
}

export async function importPayoutBalanceTransactions(localPayoutId: string) {
  const prisma = getPrisma();
  const payout = await prisma.stripePayout.findUniqueOrThrow({ where: { id: localPayoutId } });

  if (!payout.automatic) {
    await setPayoutStatus(payout.id, "unsupported_manual_payout", {
      lastImportError:
        "Manuelle Auszahlung – automatische Transaktionszuordnung nicht vollständig unterstützt",
    });
    return payout;
  }

  await prisma.stripePayout.update({
    where: { id: payout.id },
    data: {
      transactionReconciliationStatus: "importing",
      importAttemptCount: { increment: 1 },
      lastImportError: null,
    },
  });

  try {
    const stripe = getStripe();
    const stripePayout = await stripe.payouts.retrieve(payout.stripePayoutId);
    await upsertStripePayoutFromObject(stripePayout);

    const bts = await listAllBalanceTransactionsForPayout(payout.stripePayoutId);
    let orgId = payout.organizationId;

    for (const bt of bts) {
      const sourceIds = await resolveSourceIds(bt);
      const classification = classifyBalanceTransaction({
        type: bt.type,
        reportingCategory: bt.reporting_category,
        description: bt.description,
        sourceType: sourceIds.stripeSourceType,
      });

      const mapping = await mapBalanceTransactionToOrder({
        id: bt.id,
        stripeBalanceTransactionId: bt.id,
        stripeChargeId: sourceIds.stripeChargeId,
        stripePaymentIntentId: sourceIds.stripePaymentIntentId,
        classification,
        metadataOrderId: sourceIds.metadataOrderId,
        metadataInvoiceNumber: sourceIds.metadataInvoiceNumber,
      });

      if (mapping.organizationId && !orgId) orgId = mapping.organizationId;

      // Strip oversized raw — keep type/ids only in summary
      const rawSlim = {
        id: bt.id,
        type: bt.type,
        amount: bt.amount,
        fee: bt.fee,
        net: bt.net,
        currency: bt.currency,
        reporting_category: bt.reporting_category,
        description: bt.description,
        source: sourceIds.stripeSourceId,
      };

      await prisma.stripeBalanceTransaction.upsert({
        where: { stripeBalanceTransactionId: bt.id },
        create: {
          organizationId: mapping.organizationId ?? orgId,
          stripeBalanceTransactionId: bt.id,
          stripePayoutId: payout.stripePayoutId,
          localPayoutId: payout.id,
          stripeSourceId: sourceIds.stripeSourceId,
          stripeSourceType: sourceIds.stripeSourceType,
          stripeChargeId: sourceIds.stripeChargeId,
          stripePaymentIntentId: sourceIds.stripePaymentIntentId,
          stripeRefundId: sourceIds.stripeRefundId,
          stripeDisputeId: sourceIds.stripeDisputeId,
          ticketfeelingOrderId: mapping.ticketfeelingOrderId,
          ticketfeelingInvoiceId: mapping.ticketfeelingInvoiceId,
          type: bt.type,
          reportingCategory: bt.reporting_category ?? null,
          amountCents: bt.amount,
          feeCents: bt.fee ?? 0,
          netCents: bt.net,
          currency: bt.currency,
          exchangeRate: bt.exchange_rate != null ? bt.exchange_rate : null,
          availableOn: unixToDate(bt.available_on),
          createdAtStripe: unixToDate(bt.created),
          description: bt.description,
          classification,
          mappingStatus: mapping.mappingStatus,
          rawStripeObject: rawSlim,
        },
        update: {
          organizationId: mapping.organizationId ?? orgId,
          localPayoutId: payout.id,
          stripePayoutId: payout.stripePayoutId,
          stripeSourceId: sourceIds.stripeSourceId,
          stripeSourceType: sourceIds.stripeSourceType,
          stripeChargeId: sourceIds.stripeChargeId,
          stripePaymentIntentId: sourceIds.stripePaymentIntentId,
          stripeRefundId: sourceIds.stripeRefundId,
          stripeDisputeId: sourceIds.stripeDisputeId,
          ticketfeelingOrderId: mapping.ticketfeelingOrderId,
          ticketfeelingInvoiceId: mapping.ticketfeelingInvoiceId,
          type: bt.type,
          reportingCategory: bt.reporting_category ?? null,
          amountCents: bt.amount,
          feeCents: bt.fee ?? 0,
          netCents: bt.net,
          currency: bt.currency,
          classification,
          mappingStatus:
            mapping.mappingStatus === "mapped" || mapping.mappingStatus === "unmapped"
              ? mapping.mappingStatus
              : undefined,
          rawStripeObject: rawSlim,
        },
      });
    }

    const stored = await prisma.stripeBalanceTransaction.findMany({
      where: { localPayoutId: payout.id },
    });

    const recon = reconcilePayoutAmount({
      payoutAmountCents: stripePayout.amount,
      balanceTransactions: stored.map((s) => ({ netCents: s.netCents, type: s.type })),
      paginationComplete: true,
    });

    const hasUnknown = stored.some((s) => s.classification === "unknown");
    const hasUnmapped = stored.some(
      (s) =>
        (s.classification === "payment" ||
          s.classification === "refund" ||
          s.classification === "dispute") &&
        s.mappingStatus === "unmapped",
    );

    let nextStatus: PayoutReconciliationStatus = "reconciled";
    if (hasUnknown || hasUnmapped) nextStatus = "review_required";
    else if (!recon.ok) nextStatus = "unreconciled";
    else if (stored.length === 0) nextStatus = "awaiting_stripe_data";

    const summary = {
      paymentNetCents: stored
        .filter((s) => s.classification === "payment")
        .reduce((a, s) => a + s.amountCents, 0),
      feeCents: stored
        .filter((s) => s.classification === "stripe_fee" || s.classification === "dispute_fee")
        .reduce((a, s) => a + Math.abs(s.amountCents || s.feeCents), 0),
      refundCents: stored
        .filter((s) => s.classification === "refund")
        .reduce((a, s) => a + Math.abs(s.amountCents), 0),
      disputeCents: stored
        .filter((s) => s.classification === "dispute")
        .reduce((a, s) => a + Math.abs(s.amountCents), 0),
      unknownCount: stored.filter((s) => s.classification === "unknown").length,
      unmappedCount: stored.filter((s) => s.mappingStatus === "unmapped").length,
      orderCount: new Set(
        stored.map((s) => s.ticketfeelingOrderId).filter(Boolean) as string[],
      ).size,
    };

    await prisma.stripePayout.update({
      where: { id: payout.id },
      data: {
        organizationId: orgId,
        balanceTransactionCount: stored.length,
        paginationComplete: true,
        reconciliationDifferenceCents: recon.differenceCents,
        transactionReconciliationStatus: nextStatus,
        transactionReconciliationCompletedAt:
          nextStatus === "reconciled" ? new Date() : null,
        lastSyncedAt: new Date(),
        lastImportError: recon.ok
          ? hasUnknown || hasUnmapped
            ? "Prüfung erforderlich (unbekannt/unzugeordnet)"
            : null
          : `Abweichung ${recon.differenceCents} Cent`,
        summaryJson: summary,
      },
    });

    await writePayoutAudit({
      localPayoutId: payout.id,
      organizationId: orgId,
      action: "payout_transactions_imported",
      newValue: {
        count: stored.length,
        status: nextStatus,
        differenceCents: recon.differenceCents,
      },
    });

    return prisma.stripePayout.findUniqueOrThrow({ where: { id: payout.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.stripePayout.update({
      where: { id: payout.id },
      data: {
        transactionReconciliationStatus: "in_progress",
        lastImportError: message.slice(0, 2000),
        lastSyncedAt: new Date(),
      },
    });
    throw error;
  }
}
