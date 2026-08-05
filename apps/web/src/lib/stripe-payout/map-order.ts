import { getPrisma } from "@/lib/db";
import { classificationRequiresOrder } from "@/lib/stripe-payout/classify";
import type { BalanceClassification, MappingStatus } from "@/lib/stripe-payout/types";

/**
 * Resolve Ticketfeeling order/invoice for a balance transaction.
 * Never uses amount+date alone as automatic mapping.
 */
export async function mapBalanceTransactionToOrder(input: {
  id: string;
  stripeBalanceTransactionId: string;
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
  classification: BalanceClassification;
  metadataOrderId?: string | null;
  metadataInvoiceNumber?: string | null;
}): Promise<{
  ticketfeelingOrderId: string | null;
  ticketfeelingInvoiceId: string | null;
  organizationId: string | null;
  mappingStatus: MappingStatus;
}> {
  const prisma = getPrisma();

  if (!classificationRequiresOrder(input.classification)) {
    return {
      ticketfeelingOrderId: null,
      ticketfeelingInvoiceId: null,
      organizationId: null,
      mappingStatus: "mapped",
    };
  }

  let order =
    (input.stripeBalanceTransactionId
      ? await prisma.order.findFirst({
          where: { stripeBalanceTransactionId: input.stripeBalanceTransactionId },
        })
      : null) ??
    (input.stripeChargeId
      ? await prisma.order.findFirst({ where: { stripeChargeId: input.stripeChargeId } })
      : null) ??
    (input.stripePaymentIntentId
      ? await prisma.order.findFirst({
          where: { stripePaymentIntentId: input.stripePaymentIntentId },
        })
      : null);

  if (!order && input.metadataOrderId) {
    order = await prisma.order.findUnique({ where: { id: input.metadataOrderId } });
  }

  if (!order && input.metadataInvoiceNumber) {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: input.metadataInvoiceNumber },
      include: { order: true },
    });
    order = invoice?.order ?? null;
    if (order) {
      return {
        ticketfeelingOrderId: order.id,
        ticketfeelingInvoiceId: invoice!.id,
        organizationId: order.organizationId,
        mappingStatus: "mapped",
      };
    }
  }

  if (!order) {
    return {
      ticketfeelingOrderId: null,
      ticketfeelingInvoiceId: null,
      organizationId: null,
      mappingStatus: "unmapped",
    };
  }

  const invoice = await prisma.invoice.findFirst({
    where: { orderId: order.id },
    orderBy: { issuedAt: "desc" },
  });

  return {
    ticketfeelingOrderId: order.id,
    ticketfeelingInvoiceId: invoice?.id ?? null,
    organizationId: order.organizationId,
    mappingStatus: "mapped",
  };
}

export async function applyManualOrderMapping(input: {
  balanceTransactionId: string;
  orderId: string;
  actorUserId: string;
  reason?: string;
}) {
  const prisma = getPrisma();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: input.orderId } });
  const invoice = await prisma.invoice.findFirst({
    where: { orderId: order.id },
    orderBy: { issuedAt: "desc" },
  });
  const bt = await prisma.stripeBalanceTransaction.update({
    where: { id: input.balanceTransactionId },
    data: {
      ticketfeelingOrderId: order.id,
      ticketfeelingInvoiceId: invoice?.id ?? null,
      organizationId: order.organizationId,
      mappingStatus: "manual",
    },
  });
  if (bt.localPayoutId) {
    const { writePayoutAudit } = await import("@/lib/stripe-payout/audit");
    await writePayoutAudit({
      localPayoutId: bt.localPayoutId,
      organizationId: order.organizationId,
      action: "manual_order_mapping",
      newValue: {
        balanceTransactionId: bt.id,
        orderId: order.id,
        invoiceId: invoice?.id ?? null,
      },
      actorType: "user",
      actorId: input.actorUserId,
      reason: input.reason ?? null,
    });
  }
  return bt;
}
