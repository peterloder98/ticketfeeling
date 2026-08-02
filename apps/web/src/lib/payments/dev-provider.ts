import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider } from "@/lib/payments/types";

export const devPaymentProvider: PaymentProvider = {
  key: "dev",
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      provider: "dev",
      providerPaymentId: `dev_${input.orderId}`,
      status: "pending",
      clientPayPath: `/checkout/pay/${input.orderId}`,
    };
  },
};
