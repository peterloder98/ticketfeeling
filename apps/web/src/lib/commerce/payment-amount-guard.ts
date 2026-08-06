/**
 * Defense-in-depth: Stripe PaymentIntent amount/currency must match the order.
 * On mismatch, do not fulfill — ops review required.
 */

export type PaymentAmountMatchInput = {
  paymentAmountCents: number;
  paymentCurrency: string;
  customerTotalCents: number;
  grossCents: number;
  orderCurrency: string;
};

export type PaymentAmountMatchResult =
  | { ok: true; expectedCents: number; currency: string }
  | {
      ok: false;
      expectedCents: number;
      actualCents: number;
      expectedCurrency: string;
      actualCurrency: string;
      reason: "amount_mismatch" | "currency_mismatch";
    };

/** Same formula as checkout PaymentIntent creation (`customerTotal || gross`). */
export function expectedOrderPayableCents(order: {
  customerTotalCents: number;
  grossCents: number;
}): number {
  return Math.max(0, order.customerTotalCents || order.grossCents);
}

/** Normalize ISO currency codes for comparison (Stripe sends lowercase). */
export function normalizeCurrency(code: string | null | undefined): string {
  return (code ?? "EUR").trim().toLowerCase() || "eur";
}

export function paymentAmountMatchesOrder(
  input: PaymentAmountMatchInput,
): PaymentAmountMatchResult {
  const expectedCents = expectedOrderPayableCents({
    customerTotalCents: input.customerTotalCents,
    grossCents: input.grossCents,
  });
  const expectedCurrency = normalizeCurrency(input.orderCurrency);
  const actualCurrency = normalizeCurrency(input.paymentCurrency);
  const actualCents = Math.max(0, Math.floor(input.paymentAmountCents));

  if (actualCurrency !== expectedCurrency) {
    return {
      ok: false,
      expectedCents,
      actualCents,
      expectedCurrency,
      actualCurrency,
      reason: "currency_mismatch",
    };
  }
  if (actualCents !== expectedCents) {
    return {
      ok: false,
      expectedCents,
      actualCents,
      expectedCurrency,
      actualCurrency,
      reason: "amount_mismatch",
    };
  }
  return { ok: true, expectedCents, currency: expectedCurrency };
}

/** Whether fulfillPaidOrder should short-circuit as already done (QR/tokens stay stable). */
export function isOrderAlreadyFulfilled(order: {
  fulfillmentLockedAt: Date | null;
  status: string;
  ticketCount: number;
}): boolean {
  return Boolean(
    order.fulfillmentLockedAt && order.status === "fulfilled" && order.ticketCount > 0,
  );
}
