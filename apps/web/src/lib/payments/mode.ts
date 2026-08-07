/**
 * Payment runtime helpers — test vs live, temporary production allow-list.
 */

export function allowDevPaymentsInProduction(): boolean {
  const raw = (process.env.ALLOW_DEV_PAYMENTS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Stripe secret/publishable keys are test-mode (sk_test / pk_test). */
export function isStripeTestMode(): boolean {
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  const pk =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    process.env.STRIPE_PUBLISHABLE_KEY ??
    "";
  return (
    sk.startsWith("sk_test") ||
    sk.startsWith("rk_test") ||
    pk.startsWith("pk_test")
  );
}

/** True when checkout must not take real money (dev provider or Stripe test keys). */
export function isPaymentTestMode(providerKey?: string): boolean {
  if (providerKey === "dev") return true;
  return isStripeTestMode();
}
