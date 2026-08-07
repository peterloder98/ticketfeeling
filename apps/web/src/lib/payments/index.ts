import { allowDevPaymentsInProduction } from "@/lib/payments/mode";
import { devPaymentProvider } from "@/lib/payments/dev-provider";
import { stripePaymentProvider } from "@/lib/payments/stripe-provider";
import type { PaymentProvider } from "@/lib/payments/types";

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL !== "1")
  );
}

export function getPaymentProvider(): PaymentProvider {
  const key = (process.env.PAYMENT_PROVIDER ?? "dev").trim().toLowerCase();
  // Hard-refuse fake payments in production (#16), unless temporary ALLOW_DEV_PAYMENTS=1.
  if (isProductionRuntime() && key !== "stripe") {
    if (key === "dev" && allowDevPaymentsInProduction()) {
      console.warn(
        "[payments] ALLOW_DEV_PAYMENTS=1 — PAYMENT_PROVIDER=dev active in production (no live charges). Restore stripe + live keys when done.",
      );
      return devPaymentProvider;
    }
    console.error(
      "[payments] PAYMENT_PROVIDER=dev (or unset) is forbidden when VERCEL_ENV=production",
      { key, vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV },
    );
    throw new Error("PAYMENT_PROVIDER_DEV_FORBIDDEN_IN_PRODUCTION");
  }
  if (key === "stripe") return stripePaymentProvider;
  return devPaymentProvider;
}

export type { PaymentProvider, CreatePaymentInput, CreatePaymentResult } from "@/lib/payments/types";
