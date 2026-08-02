import { devPaymentProvider } from "@/lib/payments/dev-provider";
import { stripePaymentProvider } from "@/lib/payments/stripe-provider";
import type { PaymentProvider } from "@/lib/payments/types";

export function getPaymentProvider(): PaymentProvider {
  const key = process.env.PAYMENT_PROVIDER ?? "dev";
  if (key === "stripe") return stripePaymentProvider;
  return devPaymentProvider;
}

export type { PaymentProvider, CreatePaymentInput, CreatePaymentResult } from "@/lib/payments/types";
