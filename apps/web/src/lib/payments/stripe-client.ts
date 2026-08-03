import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!cached) {
    cached = new Stripe(key, {
      apiVersion: "2025-08-27.basil",
      typescript: true,
      // Fail fast — never leave checkout spinning for minutes on a stuck Stripe call.
      timeout: 18_000,
      maxNetworkRetries: 1,
    });
  }
  return cached;
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}
