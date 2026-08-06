import { getStripe, isStripeConfigured } from "@/lib/payments/stripe-client";

/** Stripe Terminal Location ID (Dashboard → Terminal → Locations). Required for Tap to Pay. */
export function getStripeTerminalLocationId(): string | null {
  const id = process.env.STRIPE_TERMINAL_LOCATION_ID?.trim();
  return id || null;
}

export function isStripeTerminalConfigured() {
  return isStripeConfigured() && Boolean(getStripeTerminalLocationId());
}

/**
 * Short-lived ConnectionToken for Stripe Terminal SDK (iOS Tap to Pay companion).
 * Location is optional on the token; the SDK uses STRIPE_TERMINAL_LOCATION_ID when discovering.
 */
export async function createTerminalConnectionToken() {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");
  const stripe = getStripe();
  const token = await stripe.terminal.connectionTokens.create();
  return { secret: token.secret as string };
}

export type TerminalPaymentIntentInput = {
  orderId: string;
  organizationId: string;
  soldByUserId: string;
  amountCents: number;
  currency: string;
  orderNumber: string;
  eventId: string;
  customerEmail?: string | null;
};

/**
 * PaymentIntent for Stripe Terminal / Tap to Pay on iPhone.
 * Settles like online card → same weekly Monday Stripe payouts; reconcile via metadata.
 */
export async function createTerminalPaymentIntent(input: TerminalPaymentIntentInput) {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");
  const stripe = getStripe();
  const locationId = getStripeTerminalLocationId();

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      receipt_email: input.customerEmail || undefined,
      metadata: {
        orderId: input.orderId,
        order_id: input.orderId,
        organizationId: input.organizationId,
        soldByUserId: input.soldByUserId,
        eventId: input.eventId,
        event_id: input.eventId,
        source: "box_office_tap",
        application_name: "ticketfeeling",
        environment:
          process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ||
          process.env.STRIPE_SECRET_KEY?.startsWith("rk_test")
            ? "test"
            : "live",
        ...(locationId ? { terminalLocationId: locationId } : {}),
      },
      description: `Tageskasse Tap to Pay ${input.orderNumber}`,
    },
    { idempotencyKey: `pi_box_tap_${input.orderId}` },
  );

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    locationId,
  };
}

export async function cancelTerminalPaymentIntent(paymentIntentId: string) {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");
  const stripe = getStripe();
  return stripe.paymentIntents.cancel(paymentIntentId);
}
