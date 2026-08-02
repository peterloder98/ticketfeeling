export type CreatePaymentInput = {
  organizationId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
};

export type CreatePaymentResult = {
  provider: string;
  providerPaymentId: string;
  status: "pending" | "requires_action" | "paid";
  clientPayPath?: string;
  /** Stripe PaymentIntent client_secret for Elements */
  clientSecret?: string;
}

/**
 * Payment providers must settle on the merchant account of the organizer
 * (Peter Loder). Ticketfeeling must not hold customer funds.
 */
export interface PaymentProvider {
  readonly key: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}
