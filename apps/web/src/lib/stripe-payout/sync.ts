import type Stripe from "stripe";
import { getPrisma } from "@/lib/db";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe-client";
import { hashPayload } from "@/lib/stripe-payout/audit";
import {
  importPayoutBalanceTransactions,
  upsertStripePayoutFromObject,
} from "@/lib/stripe-payout/import-payout";
import { stripeEnvironment } from "@/lib/stripe-payout/types";

const PAYOUT_EVENT_TYPES = new Set([
  "payout.created",
  "payout.updated",
  "payout.paid",
  "payout.failed",
  "payout.canceled",
]);

export function isPayoutWebhookEvent(type: string) {
  return PAYOUT_EVENT_TYPES.has(type) || type === "balance.available";
}

export async function enqueueStripeWebhookEvent(event: Stripe.Event) {
  const prisma = getPrisma();
  const object = event.data.object as { id?: string };
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing?.processingStatus === "processed") {
    return { duplicate: true as const, id: existing.id };
  }

  const row = await prisma.stripeWebhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      eventType: event.type,
      environment: stripeEnvironment(),
      objectId: object?.id ?? null,
      processingStatus: "queued",
      payloadHash: hashPayload({ id: event.id, type: event.type }),
    },
    update: {
      processingStatus: existing?.processingStatus === "failed" ? "queued" : "queued",
      retryCount: existing ? { increment: 0 } : undefined,
    },
  });

  return { duplicate: false as const, id: row.id };
}

export async function processQueuedPayoutWebhook(event: Stripe.Event) {
  const prisma = getPrisma();
  await enqueueStripeWebhookEvent(event);

  try {
    if (PAYOUT_EVENT_TYPES.has(event.type)) {
      const payout = event.data.object as Stripe.Payout;
      const row = await upsertStripePayoutFromObject(payout);
      if (event.type === "payout.paid" || event.type === "payout.updated") {
        // Import may be heavy — still run here; cron retries failures
        await importPayoutBalanceTransactions(row.id);
      }
    }

    if (event.type === "balance.available") {
      // Cron will pick up awaiting payouts; mark event processed
    }

    if (event.type === "charge.updated") {
      const charge = event.data.object as Stripe.Charge;
      const bt =
        typeof charge.balance_transaction === "string"
          ? charge.balance_transaction
          : charge.balance_transaction?.id;
      if (bt) {
        const pending = await prisma.stripeBalanceTransaction.findFirst({
          where: {
            OR: [
              { stripeChargeId: charge.id },
              {
                stripePaymentIntentId:
                  typeof charge.payment_intent === "string"
                    ? charge.payment_intent
                    : charge.payment_intent?.id ?? undefined,
              },
            ],
            mappingStatus: "awaiting_balance",
          },
        });
        if (pending?.localPayoutId) {
          await importPayoutBalanceTransactions(pending.localPayoutId);
        }
      }
    }

    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { processingStatus: "processed", processedAt: new Date(), lastError: null },
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        processingStatus: "failed",
        lastError: message.slice(0, 2000),
        retryCount: { increment: 1 },
      },
    });
    throw error;
  }
}

export async function runPayoutReconcileJob(input: {
  kind: "daily" | "monthly" | "manual";
  lookbackDays: number;
  organizationId?: string | null;
}) {
  const prisma = getPrisma();
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const run = await prisma.stripePayoutReconcileRun.create({
    data: {
      kind: input.kind,
      lookbackDays: input.lookbackDays,
      organizationId: input.organizationId ?? null,
      status: "running",
    },
  });

  try {
    const stripe = getStripe();
    const since = Math.floor((Date.now() - input.lookbackDays * 86400_000) / 1000);
    let startingAfter: string | undefined;
    let seen = 0;
    let updated = 0;

    for (let page = 0; page < 50; page++) {
      const list = await stripe.payouts.list({
        limit: 100,
        created: { gte: since },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const payout of list.data) {
        seen += 1;
        const row = await upsertStripePayoutFromObject(payout);
        const needsImport =
          row.transactionReconciliationStatus !== "reconciled" ||
          !row.paginationComplete ||
          Boolean(row.lastImportError);
        if (needsImport && row.automatic) {
          await importPayoutBalanceTransactions(row.id);
          updated += 1;
        }
      }
      if (!list.has_more) break;
      startingAfter = list.data[list.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    // Retry failed webhook events for payouts
    const failedEvents = await prisma.stripeWebhookEvent.findMany({
      where: {
        processingStatus: "failed",
        eventType: { startsWith: "payout." },
        retryCount: { lt: 10 },
      },
      take: 50,
      orderBy: { receivedAt: "asc" },
    });
    for (const ev of failedEvents) {
      try {
        const stripeEvent = await stripe.events.retrieve(ev.stripeEventId);
        await processQueuedPayoutWebhook(stripeEvent);
      } catch {
        // counted in event retry
      }
    }

    await prisma.stripePayoutReconcileRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        finishedAt: new Date(),
        payoutsSeen: seen,
        payoutsUpdated: updated,
        summaryJson: { since, failedWebhookRetries: failedEvents.length },
      },
    });

    return { runId: run.id, seen, updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.stripePayoutReconcileRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message.slice(0, 2000),
      },
    });
    throw error;
  }
}
