import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider } from "@/lib/payments/types";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe-client";
import { prisma } from "@/lib/db";
import type { PaymentMethodKey } from "@/lib/commerce/payment-fees";

function paymentMethodTypesFor(method: string | null | undefined): string[] {
  if (method === "sepa_debit" || method === "stripe_sepa") return ["sepa_debit"];
  if (method === "klarna") return ["klarna"];
  // card covers Apple Pay / Google Pay wallets in Payment Element
  return ["card"];
}

/**
 * Stripe Direct Charges on the organizer merchant account.
 * Creates a PaymentIntent for the full customer total (tickets + Verwaltungsgebühr).
 */
export const stripePaymentProvider: PaymentProvider = {
  key: "stripe",
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!isStripeConfigured()) {
      throw new Error("STRIPE_NOT_CONFIGURED");
    }

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { items: true },
    });

    const stripe = getStripe();
    const methodTypes = paymentMethodTypesFor(order.paymentMethod);
    const eventId = order.items[0]?.eventId ?? "";

    let intent;
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          payment_method_types: methodTypes,
          receipt_email: input.customerEmail,
          metadata: {
            orderId: order.id,
            eventId,
            feePercentage: String(order.administrationFeePercentageBasisPoints),
            ticketSubtotalCents: String(order.ticketSubtotalCents),
            administrationFeeCents: String(
              order.administrationFeeGrossCents || order.feeGrossCents,
            ),
            totalGrossCents: String(order.customerTotalCents || order.grossCents),
            environment: process.env.NODE_ENV ?? "development",
          },
          description: `Ticketfeeling ${order.orderNumber}`,
          ...(methodTypes.includes("klarna")
            ? {
                payment_method_options: {
                  klarna: { preferred_locale: "de-DE" as const },
                },
              }
            : {}),
        },
        { idempotencyKey: `pi_order_${order.id}` },
      );
    } catch (error) {
      console.error("[stripe] paymentIntents.create failed", {
        orderId: order.id,
        methodTypes,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripePaymentIntentId: intent.id,
        providerTransactionId: intent.id,
        paymentProvider: "stripe",
      },
    });

    return {
      provider: "stripe",
      providerPaymentId: intent.id,
      status: intent.status === "succeeded" ? "paid" : "requires_action",
      clientPayPath: `/checkout/pay/${order.id}`,
      clientSecret: intent.client_secret ?? undefined,
    };
  },
};

export function stripeMethodsForCheckout(method: PaymentMethodKey): string[] {
  return paymentMethodTypesFor(method);
}
