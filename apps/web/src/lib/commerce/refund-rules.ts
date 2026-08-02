/**
 * Refund / dispute handling rules for Stripe-paid orders.
 *
 * Product policy: no customer self-serve / online refunds.
 * Refunds exist only for full event cancellation (ops in Stripe).
 * This module only reacts to Stripe `charge.refunded` webhooks.
 *
 * - Full refund (amount >= customer total): void active tickets, mark order refunded.
 * - Partial refund: keep tickets active; record amount only (manual review).
 * - Stripe PSP fees are cost, not revenue — never reduced from ticket/fee snapshots.
 */

export function isFullRefund(input: {
  refundedAmountCents: number;
  customerTotalCents: number;
  grossCents: number;
}): boolean {
  const total = input.customerTotalCents || input.grossCents;
  return input.refundedAmountCents >= total && total > 0;
}

export function shouldVoidTicketsOnRefund(input: {
  refundedAmountCents: number;
  customerTotalCents: number;
  grossCents: number;
}): boolean {
  return isFullRefund(input);
}
